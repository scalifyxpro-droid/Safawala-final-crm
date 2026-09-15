'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, createSession } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { withServiceRole, withUserContext } from '@/lib/db/client';

export type SettingsActionState = { error: string; notice: string };

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Administrator access is required.');
  return user;
}

async function optionalImageDataUrl(
  formData: FormData,
  name: string,
  maxBytes: number,
) {
  const value = formData.get(name);
  if (!(value instanceof File) || value.size === 0) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(value.type)) {
    throw new Error('Use a JPEG, PNG or WebP image.');
  }
  if (value.size > maxBytes) {
    throw new Error(`The image must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  return `data:${value.type};base64,${Buffer.from(await value.arrayBuffer()).toString('base64')}`;
}

export async function changeLoginEmailAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireAdmin();
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
  const user = await requireAdmin();
  const currentPassword = formText(formData, 'current_password');
  const password = formText(formData, 'password');
  const confirmation = formText(formData, 'password_confirmation');
  if (!currentPassword) return { error: 'Enter your current password.', notice: '' };
  if (password.length < 8) return { error: 'The new password must contain at least 8 characters.', notice: '' };
  if (password !== confirmation) return { error: 'The password confirmation does not match.', notice: '' };

  try {
    const currentHash = await withServiceRole(async (tx) => {
      const [row] = await tx<{ encrypted_password: string | null }[]>`
        select encrypted_password from auth.users where id = ${user.id}
      `;
      return row?.encrypted_password ?? null;
    });
    if (!currentHash || !(await verifyPassword(currentPassword, currentHash))) {
      return { error: 'The current password is incorrect.', notice: '' };
    }
    if (await verifyPassword(password, currentHash)) {
      return { error: 'Choose a new password different from your current password.', notice: '' };
    }
    const passwordHash = await hashPassword(password);
    await withServiceRole((tx) => tx`
      update auth.users set encrypted_password = ${passwordHash}, updated_at = now() where id = ${user.id}
    `);
    await createSession({ sub: user.id, role: 'admin', email: user.email });
    return { error: '', notice: 'Password changed successfully.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to change the password.',
      notice: '',
    };
  }
}

export async function saveProfileAction(formData: FormData): Promise<SettingsActionState> {
  try {
    const user = await requireAdmin();
    const fullName = formText(formData, 'full_name').trim();
    const phone = formText(formData, 'phone').replace(/\s+/g, '');
    const emergencyPhone = formText(formData, 'emergency_contact_phone').replace(/\s+/g, '');
    if (fullName.length < 2) return { error: 'Enter your full name.', notice: '' };
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) return { error: 'Enter a valid phone number.', notice: '' };
    if (emergencyPhone && !/^\+?[0-9]{10,15}$/.test(emergencyPhone)) {
      return { error: 'Enter a valid emergency contact number.', notice: '' };
    }
    const avatar = await optionalImageDataUrl(formData, 'avatar', 2 * 1024 * 1024);
    const removeAvatar = formText(formData, 'remove_avatar') === 'true';
    const employeeId = formText(formData, 'employee_id').trim().toUpperCase() || null;

    await withUserContext(user.id, async (tx) => {
      const [row] = await tx`
        update public.profiles set
          full_name = ${fullName},
          avatar_url = case when ${removeAvatar} then null when ${avatar}::text is not null then ${avatar} else avatar_url end,
          phone = ${phone || null},
          designation = ${formText(formData, 'designation').trim() || null},
          department = ${formText(formData, 'department').trim() || null},
          employee_id = ${employeeId},
          date_of_joining = ${formText(formData, 'date_of_joining') || null}::date,
          emergency_contact_name = ${formText(formData, 'emergency_contact_name').trim() || null},
          emergency_contact_phone = ${emergencyPhone || null},
          language_preference = ${formText(formData, 'language_preference') || 'en'},
          updated_at = now()
        where id = ${user.id}
        returning id
      `;
      if (!row) throw new Error('Your profile could not be found.');
    });
    revalidatePath('/settings');
    return { error: '', notice: 'Profile details saved successfully.' };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') return { error: 'That employee ID is already in use.', notice: '' };
    return { error: error instanceof Error ? error.message : 'Unable to save the profile.', notice: '' };
  }
}

export async function saveBankAccountAction(formData: FormData): Promise<SettingsActionState> {
  try {
    const user = await requireAdmin();
    const id = formText(formData, 'id') || null;
    const bankName = formText(formData, 'bank_name').trim();
    const holder = formText(formData, 'account_holder_name').trim();
    const accountNumber = formText(formData, 'account_number').replace(/\s+/g, '');
    const ifsc = formText(formData, 'ifsc_code').replace(/\s+/g, '').toUpperCase();
    const upi = formText(formData, 'upi_id').trim();
    const primary = formText(formData, 'is_primary') === 'true';
    if (bankName.length < 2 || holder.length < 2) return { error: 'Enter the bank and account-holder names.', notice: '' };
    if (!/^[0-9]{6,20}$/.test(accountNumber)) return { error: 'Account number must contain 6 to 20 digits.', notice: '' };
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { error: 'Enter a valid 11-character IFSC code.', notice: '' };
    if (upi && !/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(upi)) return { error: 'Enter a valid UPI ID.', notice: '' };
    const qrImage = await optionalImageDataUrl(formData, 'qr_code', 2 * 1024 * 1024);
    const removeQr = formText(formData, 'remove_qr') === 'true';

    await withUserContext(user.id, async (tx) => {
      const [{ count }] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.bank_accounts where owner_id = ${user.id}
      `;
      const makePrimary = primary || count === 0;
      if (makePrimary) {
        await tx`update public.bank_accounts set is_primary = false where owner_id = ${user.id}`;
      }
      if (id) {
        const [row] = await tx`
          update public.bank_accounts set
            bank_name = ${bankName}, account_holder_name = ${holder}, account_number = ${accountNumber},
            ifsc_code = ${ifsc}, branch_name = ${formText(formData, 'branch_name').trim() || null},
            upi_id = ${upi || null}, is_primary = ${makePrimary},
            qr_code_image = case when ${removeQr} then null when ${qrImage}::text is not null then ${qrImage} else qr_code_image end
          where id = ${id}::uuid and owner_id = ${user.id}
          returning id
        `;
        if (!row) throw new Error('The bank account could not be found.');
      } else {
        await tx`
          insert into public.bank_accounts (
            owner_id, bank_name, account_holder_name, account_number, ifsc_code,
            branch_name, upi_id, qr_code_image, is_primary
          ) values (
            ${user.id}, ${bankName}, ${holder}, ${accountNumber}, ${ifsc},
            ${formText(formData, 'branch_name').trim() || null}, ${upi || null}, ${qrImage}, ${makePrimary}
          )
        `;
      }
    });
    revalidatePath('/settings');
    return { error: '', notice: id ? 'Bank account updated successfully.' : 'Bank account added successfully.' };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') return { error: 'This bank account is already saved.', notice: '' };
    return { error: error instanceof Error ? error.message : 'Unable to save the bank account.', notice: '' };
  }
}

export async function setPrimaryBankAccountAction(id: string): Promise<SettingsActionState> {
  try {
    const user = await requireAdmin();
    await withUserContext(user.id, async (tx) => {
      const [account] = await tx`select id from public.bank_accounts where id = ${id}::uuid and owner_id = ${user.id}`;
      if (!account) throw new Error('The bank account could not be found.');
      await tx`update public.bank_accounts set is_primary = false where owner_id = ${user.id}`;
      await tx`update public.bank_accounts set is_primary = true where id = ${id}::uuid and owner_id = ${user.id}`;
    });
    revalidatePath('/settings');
    return { error: '', notice: 'Primary bank account updated.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update the primary account.', notice: '' };
  }
}

export async function deleteBankAccountAction(id: string): Promise<SettingsActionState> {
  try {
    const user = await requireAdmin();
    await withUserContext(user.id, async (tx) => {
      const [deleted] = await tx<{ is_primary: boolean }[]>`
        delete from public.bank_accounts where id = ${id}::uuid and owner_id = ${user.id} returning is_primary
      `;
      if (!deleted) throw new Error('The bank account could not be found.');
      if (deleted.is_primary) {
        await tx`
          update public.bank_accounts set is_primary = true
          where id = (
            select id from public.bank_accounts where owner_id = ${user.id}
            order by created_at desc limit 1
          )
        `;
      }
    });
    revalidatePath('/settings');
    return { error: '', notice: 'Bank account removed.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to remove the bank account.', notice: '' };
  }
}

export type DocumentNumberSettingInput = {
  series: string;
  prefix: string;
  next_number: number;
  number_padding: number;
  sequence_year: number;
};

export async function saveDocumentNumbersAction(settings: DocumentNumberSettingInput[]) {
  const user = await requireAdmin();
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
