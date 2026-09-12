'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

function value(form: FormData, key: string) {
  const input = form.get(key);
  return typeof input === 'string' ? input.trim() : '';
}

function databaseError(error: unknown) {
  const err = error as { code?: string; message?: string };
  if (err?.code === '42P01') {
    return 'Coupons database table is not installed. Apply railway/schema/002_app_schema.sql, then try again.';
  }
  if (err?.code === '23505') return 'That coupon code already exists.';
  return err?.message || 'Unable to save coupon offer.';
}

function parseOffer(form: FormData) {
  const code = value(form, 'code').toUpperCase().replace(/\s+/g, '');
  const name = value(form, 'name');
  const discountType = value(form, 'discount_type');
  const amount = Number(value(form, 'value'));
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new Error('Code must contain 2–32 letters, numbers, hyphens, or underscores.');
  if (!name) throw new Error('Offer name is required.');
  if (!['percentage', 'fixed'].includes(discountType)) throw new Error('Choose a valid discount type.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Value must be greater than zero.');
  return { code, name, discountType, value: amount, isActive: form.get('is_active') === 'on' };
}

export async function createCouponAction(form: FormData) {
  const user = await requireUser();
  const o = parseOffer(form);
  try {
    await withUserContext(user.id, (tx) => tx`
      insert into public.coupon_offers (owner_id, code, name, discount_type, value, is_active)
      values (${user.id}, ${o.code}, ${o.name}, ${o.discountType}, ${o.value}, ${o.isActive})
    `);
  } catch (error) {
    throw new Error(databaseError(error));
  }
  revalidatePath('/coupons');
}

export async function updateCouponAction(form: FormData) {
  const id = Number(value(form, 'id'));
  if (!Number.isInteger(id)) throw new Error('Invalid coupon offer.');
  const user = await requireUser();
  const o = parseOffer(form);
  try {
    await withUserContext(user.id, (tx) => tx`
      update public.coupon_offers
      set code = ${o.code}, name = ${o.name}, discount_type = ${o.discountType}, value = ${o.value}, is_active = ${o.isActive}, updated_at = now()
      where id = ${id} and owner_id = ${user.id}
    `);
  } catch (error) {
    throw new Error(databaseError(error));
  }
  revalidatePath('/coupons');
}

export async function toggleCouponAction(form: FormData) {
  const id = Number(value(form, 'id'));
  const active = value(form, 'is_active') === 'true';
  const user = await requireUser();
  try {
    await withUserContext(user.id, (tx) => tx`
      update public.coupon_offers set is_active = ${active}, updated_at = now() where id = ${id} and owner_id = ${user.id}
    `);
  } catch (error) {
    throw new Error(databaseError(error));
  }
  revalidatePath('/coupons');
}

export async function deleteCouponAction(form: FormData) {
  const id = Number(value(form, 'id'));
  const user = await requireUser();
  try {
    await withUserContext(user.id, (tx) => tx`delete from public.coupon_offers where id = ${id} and owner_id = ${user.id}`);
  } catch (error) {
    throw new Error(databaseError(error));
  }
  revalidatePath('/coupons');
}

export async function validateCouponAction(codeInput: string, subtotalInput: number) {
  const code = codeInput.trim().toUpperCase().replace(/\s+/g, '');
  const subtotal = Number(subtotalInput);
  if (!code || !Number.isFinite(subtotal) || subtotal <= 0) throw new Error('Enter a coupon code after adding items.');
  const user = await requireUser();
  let row: { code: string; name: string; discount_type: string; value: string } | undefined;
  try {
    const rows = await withUserContext(user.id, (tx) => tx<{ code: string; name: string; discount_type: string; value: string }[]>`
      select code, name, discount_type, value from public.coupon_offers
      where owner_id = ${user.id} and code = ${code} and is_active = true
    `);
    row = rows[0];
  } catch (error) {
    throw new Error(databaseError(error));
  }
  if (!row) throw new Error('That coupon code is invalid or inactive.');
  const discount = row.discount_type === 'percentage' ? Math.min(subtotal, (subtotal * Number(row.value)) / 100) : Math.min(subtotal, Number(row.value));
  return { code: row.code, name: row.name, discount };
}
