'use server';

import { requireUser, createSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { withServiceRole, withUserContext } from '@/lib/db/client';

export type SettingsActionState = { error: string; notice: string };

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function changeLoginEmailAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();
  const email = formText(formData, 'email').trim().toLowerCase();
  if (!isValidEmail(email)) return { error: 'Enter a valid login email address.', notice: '' };
  if (email === user.email.toLowerCase()) return { error: 'Enter a different email address.', notice: '' };

  try {
    await withServiceRole(async (tx) => {
      const existing = await tx`select id from auth.users where lower(email) = ${email} and id <> ${user.id}`;
      if (existing.length) throw new Error('That email address is already in use.');
      await tx`update auth.users set email = ${email}, updated_at = now() where id = ${user.id}`;
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update the login email.', notice: '' };
  }

  await createSession({ sub: user.id, role: user.role as 'admin' | 'staff', email });
  return { error: '', notice: 'Login email updated successfully.' };
}

export async function changePasswordAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();
  const password = formText(formData, 'password');
  const confirmation = formText(formData, 'password_confirmation');
  if (password.length < 8) return { error: 'The new password must contain at least 8 characters.', notice: '' };
  if (password !== confirmation) return { error: 'The password confirmation does not match.', notice: '' };

  const passwordHash = await hashPassword(password);
  await withServiceRole((tx) => tx`
    update auth.users set encrypted_password = ${passwordHash}, updated_at = now() where id = ${user.id}
  `);
  return { error: '', notice: 'Password changed successfully.' };
}

export type DocumentNumberSettingInput = {
  series: string;
  prefix: string;
  next_number: number;
  number_padding: number;
  sequence_year: number;
};

export async function saveDocumentNumbersAction(settings: DocumentNumberSettingInput[]) {
  const user = await requireUser();
  return withUserContext(user.id, async (tx) => {
    const rows = [];
    for (const setting of settings) {
      const [row] = await tx`
        insert into public.document_number_settings (owner_id, series, prefix, next_number, number_padding, sequence_year)
        values (${user.id}, ${setting.series}, ${setting.prefix}, ${setting.next_number}, ${setting.number_padding}, ${setting.sequence_year})
        on conflict (owner_id, series) do update set
          prefix = excluded.prefix,
          next_number = excluded.next_number,
          number_padding = excluded.number_padding,
          sequence_year = excluded.sequence_year
        returning series, prefix, next_number, number_padding, sequence_year
      `;
      rows.push(row);
    }
    return rows;
  });
}
