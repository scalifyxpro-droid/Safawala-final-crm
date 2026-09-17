'use server';

import { revalidatePath } from 'next/cache';
import {
  ACCOUNTS_PORTAL_MODULES,
  MANAGER_PORTAL_MODULES,
  type AccessModule,
} from '@/lib/staff-portal/access-modules';
import type { StaffDepartment } from '@/lib/staff-portal/constants';
import type { StaffAccessType, StaffPortalKind, StaffType } from '@/lib/staff-portal/types';
import {
  createAccount,
  resetAccountPassword,
  setAccountActive,
  setAccountModule,
  setAccountPortalKind,
  setAccountStaffType,
  setDepartmentGrant,
} from '@/lib/staff-portal/store';
import { requireUser } from '@/lib/auth/session';
import { withServiceRole, withUserContext } from '@/lib/db/client';

async function requireAdmin() {
  const user = await requireUser();
  const [profile] = await withUserContext(user.id, (tx) => tx<{ role: string }[]>`select role from public.profiles where id = ${user.id}`);
  if (profile?.role !== 'admin') throw new Error('Only an administrator can manage staff access.');
  return user.id;
}

export type StaffMemberRecord = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SaveStaffMemberInput = {
  id?: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
};

export async function saveStaffMemberAction(
  input: SaveStaffMemberInput,
): Promise<{ data: StaffMemberRecord | null; error: string }> {
  try {
    const ownerId = await requireAdmin();
    const record = await withUserContext(ownerId, async (tx) => {
      if (input.id) {
        const [row] = await tx<StaffMemberRecord[]>`
          update public.staff_members
          set name = ${input.name}, phone = ${input.phone}, email = ${input.email},
            address = ${input.address}, is_active = ${input.is_active}, updated_at = now()
          where id = ${input.id} and owner_id = ${ownerId} and deleted_at is null
          returning id, name, phone, email, address, is_active, created_at, updated_at
        `;
        return row ?? null;
      }
      const [row] = await tx<StaffMemberRecord[]>`
        insert into public.staff_members (owner_id, name, phone, email, address, is_active)
        values (${ownerId}, ${input.name}, ${input.phone}, ${input.email}, ${input.address}, ${input.is_active})
        returning id, name, phone, email, address, is_active, created_at, updated_at
      `;
      return row ?? null;
    });
    revalidatePath('/staff');
    return { data: record, error: '' };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '23505') {
      return { data: null, error: 'A staff member with this name already exists.' };
    }
    return { data: null, error: error instanceof Error ? error.message : 'Staff member could not be saved.' };
  }
}

export async function toggleStaffStatusAction(
  staffMemberId: number,
  isActive: boolean,
): Promise<{ data: StaffMemberRecord | null; error: string }> {
  try {
    const ownerId = await requireAdmin();
    const record = await withUserContext(ownerId, async (tx) => {
      const [row] = await tx<StaffMemberRecord[]>`
        update public.staff_members set is_active = ${isActive}
        where id = ${staffMemberId} and owner_id = ${ownerId} and deleted_at is null
        returning id, name, phone, email, address, is_active, created_at, updated_at
      `;
      return row ?? null;
    });
    revalidatePath('/staff');
    return { data: record, error: '' };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Staff status could not be updated.' };
  }
}

export async function deleteStaffMemberAction(staffMemberId: number | string): Promise<{ error: string }> {
  const id = typeof staffMemberId === 'number' || (typeof staffMemberId === 'string' && /^\d+$/.test(staffMemberId))
    ? Number(staffMemberId)
    : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { error: 'Invalid staff ID.' };
  }
  try {
    const ownerId = await requireAdmin();
    await withServiceRole(async (tx) => {
      const [member] = await tx<{ user_id: string | null }[]>`
        select user_id from public.staff_members
        where id = ${id} and owner_id = ${ownerId} and deleted_at is null
        for update
      `;
      if (!member) throw new Error('This staff ID was not found. Refresh the page and try again.');
      if (member.user_id === ownerId) throw new Error('You cannot delete your own admin login.');
      if (member.user_id) {
        const [profile] = await tx<{ role: string }[]>`select role from public.profiles where id = ${member.user_id}`;
        if (profile?.role !== 'staff') throw new Error('This login is not a staff account and cannot be deleted here.');
      }

      await tx`delete from public.staff_access_modules where staff_id = ${id}`;
      await tx`delete from public.staff_departments where staff_id = ${id}`;
      await tx`
        update public.staff_members
        set user_id = null, login_id = null, portal_active = false,
          is_active = false, phone = null, email = null, address = null,
          deleted_at = now(), updated_at = now()
        where id = ${id} and owner_id = ${ownerId} and deleted_at is null
      `;
      if (member.user_id) {
        // This optional HR reference has a restrictive FK, unlike the other
        // auth-user audit references. Keep the document before removing login.
        await tx`update public.hr_kyc_documents set verified_by = null where verified_by = ${member.user_id}`;
        await tx`delete from auth.users where id = ${member.user_id}`;
      }
    });
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '23503') {
      return { error: 'This staff ID is still linked to another protected record. No changes were saved.' };
    }
    return { error: error instanceof Error ? error.message : 'Staff ID could not be deleted.' };
  }
}

export async function createStaffLoginAction(input: {
  staffMemberId: number;
  name: string;
  loginId: string;
  password: string;
  departments: StaffDepartment[];
  accessType: StaffAccessType;
  staffType: StaffType;
  portalKind: StaffPortalKind;
  modules: AccessModule[];
  rollbackStaffMemberOnFailure?: boolean;
}) {
  try {
    const effectiveAccessType: StaffAccessType = input.portalKind === 'staff' ? input.accessType : 'main';
    const effectiveStaffType: StaffType = input.portalKind === 'staff' ? input.staffType : 'regular';
    const effectiveModules = input.portalKind === 'accounts'
      ? ACCOUNTS_PORTAL_MODULES
      : input.portalKind === 'manager'
        ? MANAGER_PORTAL_MODULES
        : effectiveStaffType === 'stylist'
          ? []
          : effectiveAccessType === 'staff'
            ? (['quotations', 'create_booking'] as AccessModule[])
            : input.modules;
    const effectiveDepartments = input.portalKind === 'accounts'
      ? []
      : input.departments;
    const result = await createAccount(await requireAdmin(), {
      staffMemberId: input.staffMemberId,
      name: input.name,
      loginId: input.loginId,
      password: input.password,
      departments: effectiveDepartments,
      accessType: effectiveAccessType,
      staffType: effectiveStaffType,
      portalKind: input.portalKind,
      modules: effectiveModules,
      removeStaffMemberOnFailure: input.rollbackStaffMemberOnFailure,
    });
    revalidatePath('/staff');
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not create this login.',
    };
  }
}

export async function setStaffPortalKindAction(
  userId: string,
  portalKind: StaffPortalKind,
): Promise<{ error: string }> {
  try {
    const departments: StaffDepartment[] = portalKind === 'manager'
      ? ['booking', 'warehouse', 'qc', 'stylist', 'collection', 'modification']
      : portalKind === 'accounts'
        ? []
        : ['booking'];
    const modules = portalKind === 'accounts'
      ? ACCOUNTS_PORTAL_MODULES
      : portalKind === 'manager'
        ? MANAGER_PORTAL_MODULES
        : (['quotations', 'create_booking'] as AccessModule[]);
    await setAccountPortalKind(await requireAdmin(), userId, portalKind, departments, modules);
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update portal role.' };
  }
}

export async function setStaffTypeAction(userId: string, staffType: StaffType): Promise<{ error: string }> {
  try {
    await setAccountStaffType(await requireAdmin(), userId, staffType);
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update staff type.' };
  }
}

export async function setStaffLoginActiveAction(userId: string, active: boolean): Promise<{ error: string }> {
  try {
    await setAccountActive(await requireAdmin(), userId, active);
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update staff login status.' };
  }
}

export async function setStaffDepartmentAction(
  userId: string,
  department: StaffDepartment,
  active: boolean,
): Promise<{ error: string }> {
  try {
    await setDepartmentGrant(await requireAdmin(), userId, department, active);
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update department access.' };
  }
}

export async function setStaffModuleAction(
  userId: string,
  module: AccessModule,
  enabled: boolean,
): Promise<{ error: string }> {
  try {
    await setAccountModule(await requireAdmin(), userId, module, enabled);
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update module access.' };
  }
}

export async function resetStaffLoginPasswordAction(userId: string, password: string): Promise<{ error: string }> {
  try {
    await resetAccountPassword(await requireAdmin(), userId, password);
    revalidatePath('/staff');
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not reset the password.' };
  }
}
