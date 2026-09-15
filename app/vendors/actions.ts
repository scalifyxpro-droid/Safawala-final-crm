'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { assertStaffPortalWriteAccess } from '@/lib/staff-portal/write-access';

async function owner() {
  const user = await requireUser().catch(() => null);
  if (!user) throw new Error('Admin session required.');
  return { ownerId: user.id };
}

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

// Postgres unique-violation / undefined-table codes, kept distinct from the
// old PGRST205 (PostgREST-specific) check now that we talk to Postgres
// directly — `42P01` is Postgres's own "undefined_table".
function databaseError(error: unknown, fallback: string) {
  const err = error as { code?: string; message?: string };
  if (err?.code === '42P01') {
    return 'Vendors database table is not installed. Apply railway/schema/002_app_schema.sql, then try again.';
  }
  return err?.message || fallback;
}

function parseVendor(form: FormData) {
  const name = text(form, 'name');
  const phone = text(form, 'phone');
  if (name.length < 2) throw new Error('Vendor name is required.');
  if (!/^\d{10}$/.test(phone)) throw new Error('Phone must contain exactly 10 digits.');
  return {
    name,
    phone,
    contact_person: text(form, 'contact_person') || null,
    email: text(form, 'email') || null,
    address: text(form, 'address') || null,
    notes: text(form, 'notes') || null,
  };
}

export async function createVendorAction(form: FormData) {
  await assertStaffPortalWriteAccess('vendors');
  const { ownerId } = await owner();
  const v = parseVendor(form);
  try {
    await withUserContext(ownerId, (tx) => tx`
      insert into public.vendors (owner_id, name, phone, contact_person, email, address, notes, is_active)
      values (${ownerId}, ${v.name}, ${v.phone}, ${v.contact_person}, ${v.email}, ${v.address}, ${v.notes}, true)
    `);
  } catch (error) {
    throw new Error(databaseError(error, 'Unable to save vendor.'));
  }
  revalidatePath('/vendors');
}

export async function updateVendorAction(form: FormData) {
  await assertStaffPortalWriteAccess('vendors');
  const id = Number(text(form, 'id'));
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid vendor.');
  const { ownerId } = await owner();
  const v = parseVendor(form);
  try {
    await withUserContext(ownerId, (tx) => tx`
      update public.vendors
      set name = ${v.name}, phone = ${v.phone}, contact_person = ${v.contact_person},
          email = ${v.email}, address = ${v.address}, notes = ${v.notes}, updated_at = now()
      where id = ${id} and owner_id = ${ownerId}
    `);
  } catch (error) {
    throw new Error(databaseError(error, 'Unable to update vendor.'));
  }
  revalidatePath('/vendors');
}

export async function toggleVendorStatusAction(form: FormData) {
  await assertStaffPortalWriteAccess('vendors');
  const id = Number(text(form, 'id'));
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid vendor.');
  const active = text(form, 'is_active') === 'true';
  const { ownerId } = await owner();
  try {
    await withUserContext(ownerId, (tx) => tx`
      update public.vendors
      set is_active = ${active}, updated_at = now()
      where id = ${id} and owner_id = ${ownerId}
    `);
  } catch (error) {
    throw new Error(databaseError(error, 'Unable to update vendor status.'));
  }
  revalidatePath('/vendors');
}

export async function deleteVendorAction(form: FormData) {
  await assertStaffPortalWriteAccess('vendors');
  const id = Number(text(form, 'id'));
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid vendor.');
  const { ownerId } = await owner();
  try {
    await withUserContext(ownerId, (tx) => tx`
      delete from public.vendors where id = ${id} and owner_id = ${ownerId}
    `);
  } catch (error) {
    throw new Error(databaseError(error, 'Unable to delete vendor.'));
  }
  revalidatePath('/vendors');
}
