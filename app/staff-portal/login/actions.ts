'use server';

import { redirect } from 'next/navigation';
import { withServiceRole } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { isValidStaffLoginId, staffAuthEmail } from '@/lib/staff-portal/credentials';

export type StaffLoginState = { error: string };

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function tryLogin(loginId: string, email: string, password: string) {
  return withServiceRole(async (tx) => {
    const rows = await tx<
      {
        user_id: string;
        email: string;
        encrypted_password: string | null;
        portal_active: boolean;
        is_active: boolean;
      }[]
    >`
      select sm.user_id, u.email, u.encrypted_password, sm.portal_active, sm.is_active
      from public.staff_members sm
      join auth.users u on u.id = sm.user_id
      where lower(u.email) = lower(${email}) or lower(sm.login_id) = lower(${loginId})
      order by case when lower(u.email) = lower(${email}) then 0 else 1 end
      limit 1
    `;
    const row = rows[0];
    if (!row?.encrypted_password) return { ok: false as const };
    const passwordOk = await verifyPassword(password, row.encrypted_password);
    if (!passwordOk) return { ok: false as const };
    return {
      ok: true as const,
      userId: row.user_id,
      email: row.email,
      portalActive: row.portal_active,
      isActive: row.is_active,
    };
  });
}

export async function staffLogin(_prevState: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const loginId = formText(formData, 'loginId').trim();
  const password = formText(formData, 'password');
  if (!loginId || !password) {
    return { error: 'Enter your login ID and password.' };
  }
  if (!isValidStaffLoginId(loginId)) {
    return { error: 'Enter the Login ID exactly as provided by your admin.' };
  }

  const email = staffAuthEmail(loginId);
  let result;
  try {
    result = await tryLogin(loginId, email, password);
    // Passwords are sometimes copied from escaped text as `\@`. Accept only
    // that presentation typo as a compatibility retry.
    if (!result.ok && password.includes('\\@')) {
      result = await tryLogin(loginId, email, password.replaceAll('\\@', '@'));
    }
  } catch {
    return { error: 'We could not connect to the database. Please try again.' };
  }

  if (!result.ok) {
    return { error: 'Invalid login ID or password, or your access has been disabled.' };
  }
  if (!result.portalActive || !result.isActive) {
    return { error: 'Your Login ID and password are correct, but portal access is disabled. Ask your admin to enable it.' };
  }

  await createSession({ sub: result.userId, role: 'staff', email: result.email });
  redirect('/staff-portal');
}
