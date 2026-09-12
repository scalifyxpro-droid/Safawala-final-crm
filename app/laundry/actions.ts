'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function ownerError(error: unknown) {
  const err = error as { code?: string; message?: string };
  if (err?.code === '42P01') return 'Laundry database tables are not installed. Apply railway/schema/002_app_schema.sql, then try again.';
  return err?.message || 'Unable to save laundry batch.';
}
function batchNumber() { return `LB${Math.floor(100000 + Math.random() * 900000)}`; }

type LaundryItem = { product_id?: number | null; product_name: string; quantity: number; condition_before: string; unit_cost: number; notes?: string };

function parseItems(form: FormData): LaundryItem[] {
  return JSON.parse(text(form, 'items_json') || '[]') as LaundryItem[];
}
function totalCost(items: LaundryItem[]) {
  return items.reduce((sum, item) => sum + Number(item.unit_cost || 0) * Number(item.quantity || 0), 0);
}

export async function createLaundryBatchAction(form: FormData) {
  const user = await requireUser();
  const vendorId = Number(text(form, 'vendor_id'));
  const items = parseItems(form);
  if (!vendorId || !items.length) throw new Error(!vendorId ? 'Select a laundry vendor.' : 'Add at least one item to the batch.');

  try {
    // A single transaction: if the item insert fails, the batch insert rolls
    // back too — no orphaned batch row, unlike the previous compensating-delete
    // approach against Supabase's separate REST calls.
    await withUserContext(user.id, async (tx) => {
      const [batch] = await tx<{ id: number }[]>`
        insert into public.laundry_batches (owner_id, batch_number, vendor_id, sent_date, expected_return_date, notes, total_cost)
        values (${user.id}, ${batchNumber()}, ${vendorId}, ${text(form, 'sent_date')}, ${text(form, 'expected_return_date')}, ${text(form, 'notes') || null}, ${totalCost(items)})
        returning id
      `;
      if (!batch) throw new Error('Unable to create batch.');
      for (const item of items) {
        await tx`
          insert into public.laundry_batch_items (batch_id, product_id, product_name, quantity, condition_before, unit_cost, notes)
          values (${batch.id}, ${item.product_id || null}, ${item.product_name}, ${Number(item.quantity)}, ${item.condition_before}, ${Number(item.unit_cost || 0)}, ${item.notes || null})
        `;
      }
    });
  } catch (error) {
    throw new Error(ownerError(error));
  }
  revalidatePath('/laundry');
}

export async function updateLaundryBatchAction(form: FormData) {
  const user = await requireUser();
  const id = Number(text(form, 'id'));
  const items = parseItems(form);
  if (!id || !items.length) throw new Error('Add at least one item to the batch.');

  try {
    await withUserContext(user.id, async (tx) => {
      const updated = await tx`
        update public.laundry_batches set
          vendor_id = ${Number(text(form, 'vendor_id'))}, sent_date = ${text(form, 'sent_date')},
          expected_return_date = ${text(form, 'expected_return_date')}, notes = ${text(form, 'notes') || null},
          total_cost = ${totalCost(items)}, updated_at = now()
        where id = ${id} and owner_id = ${user.id}
      `;
      if (updated.count === 0) throw new Error('Batch not found.');
      await tx`delete from public.laundry_batch_items where batch_id = ${id}`;
      for (const item of items) {
        await tx`
          insert into public.laundry_batch_items (batch_id, product_id, product_name, quantity, condition_before, unit_cost, notes)
          values (${id}, ${item.product_id || null}, ${item.product_name}, ${Number(item.quantity)}, ${item.condition_before}, ${Number(item.unit_cost || 0)}, ${item.notes || null})
        `;
      }
    });
  } catch (error) {
    throw new Error(ownerError(error));
  }
  revalidatePath('/laundry');
}

export async function updateLaundryStatusAction(id: number, status: 'returned' | 'cancelled') {
  const user = await requireUser();
  try {
    await withUserContext(user.id, (tx) => tx`
      update public.laundry_batches set status = ${status}, updated_at = now() where id = ${id} and owner_id = ${user.id}
    `);
  } catch (error) {
    throw new Error(ownerError(error));
  }
  revalidatePath('/laundry');
}

export async function addLaundryNoteAction(id: number, note: string) {
  const user = await requireUser();
  if (!note.trim()) throw new Error('Enter a note first.');
  try {
    await withUserContext(user.id, (tx) => tx`
      insert into public.laundry_batch_notes (batch_id, owner_id, note) values (${id}, ${user.id}, ${note.trim()})
    `);
  } catch (error) {
    throw new Error(ownerError(error));
  }
  revalidatePath('/laundry');
}
