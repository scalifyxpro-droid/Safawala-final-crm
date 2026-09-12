'use server';

import { revalidatePath } from 'next/cache';
import type { AccessModule } from '@/lib/staff-portal/access-modules';
import type { StaffDepartment } from '@/lib/staff-portal/constants';
import type { StaffAccessType, StaffType } from '@/lib/staff-portal/types';
import {
  createAccount,
  resetAccountPassword,
  setAccountActive,
  setAccountModule,
  setAccountStaffType,
  setDepartmentGrant,
} from '@/lib/staff-portal/store';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

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
          where id = ${input.id}
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
        where id = ${staffMemberId}
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

export async function createStaffLoginAction(input: {
  staffMemberId: number;
  name: string;
  loginId: string;
  password: string;
  departments: StaffDepartment[];
  accessType: StaffAccessType;
  staffType: StaffType;
  modules: AccessModule[];
  rollbackStaffMemberOnFailure?: boolean;
}) {
  try {
    const result = await createAccount(await requireAdmin(), {
      staffMemberId: input.staffMemberId,
      name: input.name,
      loginId: input.loginId,
      password: input.password,
      departments: input.departments,
      accessType: input.accessType,
      staffType: input.staffType,
      modules: input.staffType === 'stylist' ? [] : input.accessType === 'staff' ? ['quotations', 'create_booking'] : input.modules,
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
