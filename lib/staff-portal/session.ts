import { cache } from 'react';
import type { StaffDepartment } from './constants';
import type { StaffSession } from './types';
import { DEPARTMENT_STAFF_MODULES } from './modules';
import type { AccessModule } from './access-modules';
import { getSessionClaims, destroySession } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

/**
 * Rewrite of the original Supabase-backed getStaffSession(). Logic is
 * unchanged; only the data access moved from supabase-js (`.auth.getClaims()`
 * + a PostgREST nested/embedded select) to our own JWT session + two plain
 * joined SQL queries run inside an RLS-scoped transaction.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const claims = await getSessionClaims();
  const userId = claims?.sub;
  if (!userId) return null;

  // getStaffSession() is called from almost every authenticated route
  // (including the plain admin Bookings pages, via BookingPortalShell) just
  // to check "is this a staff login". A DB hiccup here — e.g. a column that
  // hasn't finished migrating yet — must never take down an unrelated page,
  // so any failure is treated the same as "not a staff session" instead of
  // throwing up to the route's error boundary.
  let result: {
    profile: { role: string; language_preference: string | null } | null;
    account: {
      id: number;
      name: string;
      login_id: string | null;
      portal_active: boolean;
      is_active: boolean;
      access_type: string;
      staff_type: string;
      portal_kind: string;
    } | null;
    departments: { department: string }[];
    modules: { module: string; enabled: boolean }[];
  };
  try {
    result = await withUserContext(userId, async (tx) => {
      const [profileRows, accountRows] = await Promise.all([
        tx<{ role: string; language_preference: string | null }[]>`select role, language_preference from public.profiles where id = ${userId}`,
        tx<
          {
            id: number;
            name: string;
            login_id: string | null;
            portal_active: boolean;
            is_active: boolean;
            access_type: string;
            staff_type: string;
            portal_kind: string;
          }[]
        >`
          select id, name, login_id, portal_active, is_active, access_type, staff_type, portal_kind
          from public.staff_members
          where user_id = ${userId}
        `,
      ]);
      const profile = profileRows[0] ?? null;
      const account = accountRows[0] ?? null;
      if (!account) return { profile, account: null, departments: [], modules: [] as { module: string; enabled: boolean }[] };

      const [departmentRows, moduleRows] = await Promise.all([
        tx<{ department: string }[]>`
          select department from public.staff_departments where staff_id = ${account.id}
        `,
        tx<{ module: string; enabled: boolean }[]>`
          select module, enabled from public.staff_access_modules where staff_id = ${account.id}
        `,
      ]);
      return { profile, account, departments: departmentRows, modules: moduleRows };
    });
  } catch (err) {
    console.error('[staff-portal] getStaffSession failed to load session data', err);
    return null;
  }

  const { profile, account } = result;
  if (profile?.role !== 'staff') return null;
  if (!account?.portal_active || !account.is_active) return null;

  const departments = result.departments.map((row) => row.department as StaffDepartment);
  const permissions = [...new Set(departments.flatMap((department) => DEPARTMENT_STAFF_MODULES[department]))];
  const accessType = account.access_type === 'main' ? 'main' : 'staff';
  const staffType = account.staff_type === 'stylist' ? 'stylist' : 'regular';
  const portalKind = account.portal_kind === 'accounts' || account.portal_kind === 'manager'
    ? account.portal_kind
    : 'staff';
  const configuredModules = result.modules.filter((item) => item.enabled).map((item) => item.module as AccessModule);
  const accessModules: AccessModule[] =
    staffType === 'stylist'
      ? []
      : accessType === 'staff'
      ? departments.includes('booking')
        ? ['quotations', 'create_booking']
        : []
      : [...new Set(configuredModules)];

  return {
    id: userId,
    languagePreference: profile.language_preference === 'hi' || profile.language_preference === 'gu' ? profile.language_preference : 'en',
    staffMemberId: account.id,
    name: account.name,
    loginId: account.login_id ?? '',
    departments: departments.map((department) => ({
      department,
      active: true,
      role: 'staff' as const,
    })),
    permissions,
    accessType,
    staffType,
    portalKind,
    accessModules,
    isMainId: accessType === 'main',
    managedDepartment: departments[0] ?? null,
    mainId: null,
  };
});

export function hasAccessModule(session: StaffSession, module: AccessModule) {
  return session.accessModules.includes(module);
}

export function hasActiveDepartment(session: StaffSession, department: StaffDepartment) {
  return session.departments.some((grant) => grant.department === department && grant.active);
}

export function hasModule(session: StaffSession, permission: StaffSession['permissions'][number]) {
  return session.permissions.includes(permission);
}

export async function clearStaffSessionCookie() {
  await destroySession();
}
