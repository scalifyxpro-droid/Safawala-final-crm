'use server';

import { redirect } from 'next/navigation';
import { withServiceRole } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

export type LoginState = { error: string };

function value(formData: FormData, name: string) {
  const input = formData.get(name);
  return typeof input === 'string' ? input.trim() : '';
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = value(formData, 'email');
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';
  if (!email || !password) return { error: 'Enter your email and password.' };

  let outcome: { id: string; role: string; passwordOk: boolean } | null = null;
  try {
    outcome = await withServiceRole(async (tx) => {
      const rows = await tx<{ id: string; encrypted_password: string | null; role: string }[]>`
        select u.id, u.encrypted_password, coalesce(p.role, 'admin') as role
        from auth.users u
        left join public.profiles p on p.id = u.id
        where lower(u.email) = lower(${email})
      `;
      const row = rows[0];
      if (!row?.encrypted_password) return null;
      const passwordOk = await verifyPassword(password, row.encrypted_password);
      return { id: row.id, role: row.role, passwordOk };
    });
  } catch {
    return { error: 'We could not connect to the database. Please try again.' };
  }

  if (!outcome || !outcome.passwordOk) {
    return { error: 'The email or password is incorrect. Please try again.' };
  }
  const role = outcome.role === 'staff' ? 'staff' : 'admin';
  await createSession({ sub: outcome.id, role, email });
  redirect(role === 'staff' ? '/staff-portal' : '/dashboard');
}
