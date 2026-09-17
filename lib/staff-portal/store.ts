import 'server-only';

import { withUserContext, withServiceRole, type Tx } from '@/lib/db/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { StaffDepartment } from './constants';
import type { StaffPortalAccount, StaffType, StaffAccessType, StaffPortalKind } from './types';
import type { AccessModule } from './access-modules';
import { normalizeStaffLoginId, staffAuthEmail } from './credentials';

type StaffRow = {
  id: number;
  user_id: string | null;
  name: string;
  login_id: string | null;
  portal_active: boolean;
  access_type: StaffAccessType;
  staff_type: StaffType;
  portal_kind: StaffPortalKind;
  created_at: string;
  updated_at: string;
  staff_departments: { department: StaffDepartment }[] | null;
  staff_access_modules: { module: AccessModule; enabled: boolean }[] | null;
};

// Hand-written replacement for the PostgREST embedded select
// `staff_members(...staff_departments(department),staff_access_modules(module,enabled))`.
const STAFF_ROW_QUERY = `
  select sm.id, sm.user_id, sm.name, sm.login_id, sm.portal_active, sm.access_type, sm.staff_type, sm.portal_kind, sm.created_at, sm.updated_at,
    coalesce(dept.rows, '[]'::json) as staff_departments,
    coalesce(mod.rows, '[]'::json) as staff_access_modules
  from public.staff_members sm
  left join lateral (
    select json_agg(json_build_object('department', d.department)) as rows
    from public.staff_departments d where d.staff_id = sm.id
  ) dept on true
  left join lateral (
    select json_agg(json_build_object('module', m.module, 'enabled', m.enabled)) as rows
    from public.staff_access_modules m where m.staff_id = sm.id
  ) mod on true
`;

function toAccount(row: StaffRow): StaffPortalAccount {
  return {
    id: row.user_id ?? String(row.id),
    staffMemberId: row.id,
    name: row.name,
    loginId: row.login_id ?? '',
    active: row.portal_active,
    accessType: row.access_type ?? 'staff',
    staffType: row.staff_type ?? 'regular',
    portalKind: row.portal_kind ?? 'staff',
    modules: (row.staff_access_modules ?? []).filter((item) => item.enabled).map((item) => item.module),
    departments: (row.staff_departments ?? []).map(({ department }) => ({
      department,
      active: true,
      role: 'staff' as const,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAccounts(ownerId: string): Promise<StaffPortalAccount[]> {
  // Owner-scoped read under RLS (authenticated role + app.user_id = ownerId) — no service-role secret needed.
  const rows = await withUserContext(ownerId, (tx) =>
    tx.unsafe(`${STAFF_ROW_QUERY} where sm.owner_id = $1 and sm.user_id is not null order by sm.name`, [ownerId])
  );
  return (rows as unknown as StaffRow[]).map(toAccount);
}

export async function createAccount(ownerId: string, input: {
  staffMemberId: number | null;
  name: string;
  loginId: string;
  password: string;
  departments: StaffDepartment[];
  accessType?: StaffAccessType;
  staffType?: StaffType;
  portalKind?: StaffPortalKind;
  modules?: AccessModule[];
  removeStaffMemberOnFailure?: boolean;
}): Promise<{ account?: StaffPortalAccount; error?: string }> {
  const loginId = normalizeStaffLoginId(input.loginId);
  const email = staffAuthEmail(loginId);
  const accessType = input.accessType ?? 'staff';
  const staffType = input.staffType ?? 'regular';
  const portalKind = staffType === 'stylist' ? 'staff' : input.portalKind ?? 'staff';
  if (input.name.trim().length < 2) return { error: 'Enter the staff member’s name.' };
  if (input.password.length < 6) return { error: 'Password must be at least 6 characters.' };

  return withServiceRole(async (tx) => {
    async function removePendingStaffMember() {
      if (!input.removeStaffMemberOnFailure || !input.staffMemberId) return;
      await tx`delete from public.staff_members where id = ${input.staffMemberId} and owner_id = ${ownerId} and user_id is null`;
    }

    const existing = await tx<{ id: string }[]>`select id from auth.users where lower(email) = lower(${email})`;
    if (existing.length) return { error: 'That Login ID is already in use.' };

    const encryptedPassword = await hashPassword(input.password);
    const [createdUser] = await tx<{ id: string }[]>`
      insert into auth.users (email, encrypted_password) values (${email}, ${encryptedPassword}) returning id
    `;
    if (!createdUser) {
      await removePendingStaffMember();
      return { error: 'Could not create staff login.' };
    }
    const userId = createdUser.id;

    // This must be an upsert, not an UPDATE: this self-hosted Postgres has no
    // Supabase-style trigger that auto-creates a `public.profiles` row when a
    // new `auth.users` row is inserted (line ~98 above), so an UPDATE-only
    // statement here silently affects 0 rows for every brand-new staff
    // account — leaving it with no profiles row at all, which then fails
    // every future login (getStaffSession()/proxy.ts both require a
    // `public.profiles` row with role = 'staff').
    await tx`
      insert into public.profiles (id, full_name, role)
      values (${userId}, ${input.name.trim()}, 'staff')
      on conflict (id) do update set full_name = excluded.full_name, role = excluded.role
    `;

    let staffId = input.staffMemberId;
    if (staffId) {
      const linked = await tx`
        update public.staff_members set
          user_id = ${userId}, login_id = ${loginId}, portal_active = true, is_active = true,
          name = ${input.name.trim()}, access_type = ${staffType === 'stylist' ? 'staff' : accessType}, staff_type = ${staffType}, portal_kind = ${portalKind}
        where id = ${staffId} and owner_id = ${ownerId}
      `;
      if (linked.count === 0) {
        await tx`delete from auth.users where id = ${userId}`;
        await removePendingStaffMember();
        return { error: 'Could not link the staff directory record.' };
      }
    } else {
      const [inserted] = await tx<{ id: number }[]>`
        insert into public.staff_members (owner_id, user_id, login_id, portal_active, name, is_active, access_type, staff_type, portal_kind)
        values (${ownerId}, ${userId}, ${loginId}, true, ${input.name.trim()}, true, ${staffType === 'stylist' ? 'staff' : accessType}, ${staffType}, ${portalKind})
        returning id
      `;
      if (!inserted) {
        await tx`delete from auth.users where id = ${userId}`;
        return { error: 'Could not link staff directory record.' };
      }
      staffId = inserted.id;
    }

    const linkedStaffId = staffId;
    async function rollbackCreatedLogin() {
      await tx`delete from public.staff_access_modules where staff_id = ${linkedStaffId}`;
      await tx`delete from public.staff_departments where staff_id = ${linkedStaffId}`;
      if (input.staffMemberId && !input.removeStaffMemberOnFailure) {
        await tx`update public.staff_members set user_id = null, login_id = null, portal_active = false where id = ${linkedStaffId} and owner_id = ${ownerId}`;
      } else {
        await tx`delete from public.staff_members where id = ${linkedStaffId} and owner_id = ${ownerId}`;
      }
      await tx`delete from auth.users where id = ${userId}`;
    }

    const departments: StaffDepartment[] = staffType === 'stylist' ? ['stylist'] : accessType === 'staff' ? ['booking'] : input.departments;
    if (accessType === 'staff' || staffType === 'stylist') {
      await tx`delete from public.staff_departments where staff_id = ${linkedStaffId}`;
    }
    for (const department of departments) {
      await tx`
        insert into public.staff_departments (staff_id, department, granted_by) values (${linkedStaffId}, ${department}, ${ownerId})
        on conflict (staff_id, department) do nothing
      `;
    }

    const modules = staffType === 'stylist' ? [] : accessType === 'staff' ? ['quotations', 'create_booking'] : input.modules ?? [];
    for (const accessModule of modules) {
      await tx`
        insert into public.staff_access_modules (owner_id, staff_id, module, enabled) values (${ownerId}, ${linkedStaffId}, ${accessModule}, true)
        on conflict (staff_id, module) do update set enabled = true
      `;
    }

    // Sanity check: confirm the stored hash actually verifies the password we
    // just set, before reporting success (catches hashing/encoding mistakes;
    // there's no separate auth service round trip to double-check anymore).
    const [check] = await tx<{ encrypted_password: string }[]>`select encrypted_password from auth.users where id = ${userId}`;
    if (!check || !(await verifyPassword(input.password, check.encrypted_password))) {
      await rollbackCreatedLogin();
      return { error: 'The login could not be verified after creation.' };
    }

    const rows = await tx.unsafe(`${STAFF_ROW_QUERY} where sm.id = $1 and sm.owner_id = $2`, [linkedStaffId, ownerId]);
    const accountRow = (rows as unknown as StaffRow[])[0];
    if (!accountRow) {
      await rollbackCreatedLogin();
      return { error: 'The staff login was created but could not be loaded.' };
    }
    return { account: toAccount(accountRow) };
  });
}

async function getOwnedStaffId(tx: Tx, ownerId: string, userId: string) {
  const rows = await tx<{ id: number }[]>`select id from public.staff_members where owner_id = ${ownerId} and user_id = ${userId}`;
  if (!rows[0]) throw new Error('Staff portal account was not found.');
  return rows[0].id;
}

export async function setAccountActive(ownerId: string, userId: string, active: boolean) {
  await withServiceRole(async (tx) => {
    await getOwnedStaffId(tx, ownerId, userId);
    if (active) {
      await tx`update public.staff_members set portal_active = true, is_active = true where owner_id = ${ownerId} and user_id = ${userId}`;
    } else {
      await tx`update public.staff_members set portal_active = false where owner_id = ${ownerId} and user_id = ${userId}`;
    }
  });
}

export async function setDepartmentGrant(ownerId: string, userId: string, department: StaffDepartment, active: boolean) {
  await withServiceRole(async (tx) => {
    const staffId = await getOwnedStaffId(tx, ownerId, userId);
    const [account] = await tx<{ access_type: StaffAccessType; staff_type: StaffType }[]>`
      select access_type, staff_type from public.staff_members where id = ${staffId} and owner_id = ${ownerId}
    `;
    if (!account) throw new Error('Staff portal account was not found.');
    if (account.staff_type === 'stylist') {
      if (department !== 'stylist' || !active) throw new Error('Stylist accounts are fixed to the Stylist department.');
    } else if (account.access_type === 'staff') {
      if (department !== 'booking' || !active) throw new Error('Staff IDs are fixed to the Booking department for quote creation.');
    }
    if (active) {
      await tx`
        insert into public.staff_departments (staff_id, department, granted_by) values (${staffId}, ${department}, ${ownerId})
        on conflict (staff_id, department) do nothing
      `;
    } else {
      await tx`delete from public.staff_departments where staff_id = ${staffId} and department = ${department}`;
    }
  });
}

export async function setAccountStaffType(ownerId: string, userId: string, staffType: StaffType) {
  await withUserContext(ownerId, (tx) => tx`select public.configure_staff_type(${userId}, ${staffType})`);
  if (staffType === 'stylist') {
    await withServiceRole((tx) => tx`update public.staff_members set portal_kind = 'staff' where owner_id = ${ownerId} and user_id = ${userId}`);
  }
}

export async function setAccountPortalKind(
  ownerId: string,
  userId: string,
  portalKind: StaffPortalKind,
  departments: StaffDepartment[],
  modules: AccessModule[],
) {
  await withServiceRole(async (tx) => {
    const staffId = await getOwnedStaffId(tx, ownerId, userId);
    await tx`
      update public.staff_members
      set portal_kind = ${portalKind}, staff_type = 'regular', access_type = ${portalKind === 'staff' ? 'staff' : 'main'}
      where id = ${staffId} and owner_id = ${ownerId}
    `;
    await tx`delete from public.staff_departments where staff_id = ${staffId}`;
    await tx`delete from public.staff_access_modules where staff_id = ${staffId}`;
    for (const department of departments) {
      await tx`
        insert into public.staff_departments (staff_id, department, granted_by)
        values (${staffId}, ${department}, ${ownerId})
        on conflict (staff_id, department) do nothing
      `;
    }
    for (const accessModule of modules) {
      await tx`
        insert into public.staff_access_modules (owner_id, staff_id, module, enabled)
        values (${ownerId}, ${staffId}, ${accessModule}, true)
        on conflict (staff_id, module) do update set enabled = true
      `;
    }
  });
}

export async function resetAccountPassword(ownerId: string, userId: string, password: string) {
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const encrypted = await hashPassword(password);
  await withServiceRole(async (tx) => {
    await getOwnedStaffId(tx, ownerId, userId);
    const [updated] = await tx<{ encrypted_password: string }[]>`
      update auth.users set encrypted_password = ${encrypted}, updated_at = now()
      where id = ${userId}
      returning encrypted_password
    `;
    if (!updated || !(await verifyPassword(password, updated.encrypted_password))) {
      throw new Error('The new password could not be verified in the database. Please try again.');
    }
  });
}

export async function setAccountModule(ownerId: string, userId: string, module: AccessModule, enabled: boolean) {
  await withServiceRole(async (tx) => {
    const staffId = await getOwnedStaffId(tx, ownerId, userId);
    await tx`
      insert into public.staff_access_modules (owner_id, staff_id, module, enabled) values (${ownerId}, ${staffId}, ${module}, ${enabled})
      on conflict (staff_id, module) do update set enabled = excluded.enabled
    `;
  });
}
