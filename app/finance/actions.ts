'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { withUserContext, type Tx } from '@/lib/db/client';

export type FinanceMode = 'challans' | 'vouchers' | 'expenses';
export type FinanceRecord = Record<string, unknown> & { id: number };

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}
function optStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) || null : null;
}
function randomCode(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function financeOwnerId(tx: Tx, userId: string, mode: FinanceMode) {
  const [profile] = await tx<{ role: string }[]>`select role from public.profiles where id = ${userId}`;
  if (profile?.role === 'admin') return userId;
  const [account] = await tx<{ owner_id: string; allowed: boolean }[]>`
    select sm.owner_id, public.staff_can_access(${mode}) as allowed
    from public.staff_members sm
    where sm.user_id = ${userId} and sm.portal_active = true and sm.is_active = true
  `;
  if (!account?.allowed) throw new Error('You do not have permission to manage these finance records.');
  return account.owner_id;
}

async function insertRecord(tx: Tx, ownerId: string, mode: FinanceMode, payload: Record<string, unknown>) {
  const amount = Number(payload.amount || 0);
  if (mode === 'challans') {
    const rows = await tx<FinanceRecord[]>`
      insert into public.challans (owner_id, challan_number, challan_date, party_name, mobile, amount, status, notes)
      values (${ownerId}, ${str(payload, 'challan_number') || randomCode('CHL')}, ${str(payload, 'challan_date')},
              ${str(payload, 'party_name')}, ${optStr(payload, 'mobile')}, ${amount},
              ${str(payload, 'status') || 'active'}, ${optStr(payload, 'notes')})
      returning *
    `;
    return rows[0];
  }
  if (mode === 'vouchers') {
    const rows = await tx<FinanceRecord[]>`
      insert into public.vouchers (owner_id, voucher_number, voucher_type, voucher_date, payment_mode, amount, account_name, narration, receiver_name, prepared_by)
      values (${ownerId}, ${str(payload, 'voucher_number') || randomCode('VOU')}, ${str(payload, 'voucher_type') || 'receipt'},
              ${str(payload, 'voucher_date')}, ${str(payload, 'payment_mode') || 'cash'}, ${amount},
              ${str(payload, 'account_name')}, ${optStr(payload, 'narration')}, ${optStr(payload, 'receiver_name')}, ${optStr(payload, 'prepared_by')})
      returning *
    `;
    return rows[0];
  }
  const rows = await tx<FinanceRecord[]>`
    insert into public.expenses (owner_id, amount, expense_date, category, receipt_number, description)
    values (${ownerId}, ${amount}, ${str(payload, 'expense_date')}, ${str(payload, 'category') || 'Uncategorized'},
            ${optStr(payload, 'receipt_number')}, ${optStr(payload, 'description')})
    returning *
  `;
  return rows[0];
}

async function updateRecord(tx: Tx, ownerId: string, mode: FinanceMode, id: number, payload: Record<string, unknown>) {
  const amount = Number(payload.amount || 0);
  if (mode === 'challans') {
    const rows = await tx<FinanceRecord[]>`
      update public.challans set
        challan_date = ${str(payload, 'challan_date')}, party_name = ${str(payload, 'party_name')},
        mobile = ${optStr(payload, 'mobile')}, amount = ${amount},
        status = ${str(payload, 'status') || 'active'}, notes = ${optStr(payload, 'notes')}
      where id = ${id} and owner_id = ${ownerId}
      returning *
    `;
    return rows[0];
  }
  if (mode === 'vouchers') {
    const rows = await tx<FinanceRecord[]>`
      update public.vouchers set
        voucher_type = ${str(payload, 'voucher_type') || 'receipt'}, voucher_date = ${str(payload, 'voucher_date')},
        payment_mode = ${str(payload, 'payment_mode') || 'cash'}, amount = ${amount},
        account_name = ${str(payload, 'account_name')}, narration = ${optStr(payload, 'narration')},
        receiver_name = ${optStr(payload, 'receiver_name')}, prepared_by = ${optStr(payload, 'prepared_by')}
      where id = ${id} and owner_id = ${ownerId}
      returning *
    `;
    return rows[0];
  }
  const rows = await tx<FinanceRecord[]>`
    update public.expenses set
      amount = ${amount}, expense_date = ${str(payload, 'expense_date')},
      category = ${str(payload, 'category') || 'Uncategorized'},
      receipt_number = ${optStr(payload, 'receipt_number')}, description = ${optStr(payload, 'description')}
    where id = ${id} and owner_id = ${ownerId}
    returning *
  `;
  return rows[0];
}

async function deleteRecord(tx: Tx, ownerId: string, mode: FinanceMode, id: number) {
  if (mode === 'challans') return tx`delete from public.challans where id = ${id} and owner_id = ${ownerId}`;
  if (mode === 'vouchers') return tx`delete from public.vouchers where id = ${id} and owner_id = ${ownerId}`;
  return tx`delete from public.expenses where id = ${id} and owner_id = ${ownerId}`;
}

export async function createFinanceRecordAction(mode: FinanceMode, payload: Record<string, unknown>): Promise<FinanceRecord> {
  const user = await requireUser();
  const record = await withUserContext(user.id, async (tx) => insertRecord(tx, await financeOwnerId(tx, user.id, mode), mode, payload));
  if (!record) throw new Error('Unable to save record.');
  revalidatePath(`/${mode}`);
  return record;
}

export async function updateFinanceRecordAction(mode: FinanceMode, id: number, payload: Record<string, unknown>): Promise<FinanceRecord> {
  const user = await requireUser();
  const record = await withUserContext(user.id, async (tx) => updateRecord(tx, await financeOwnerId(tx, user.id, mode), mode, id, payload));
  if (!record) throw new Error('Unable to update record — it may belong to a different account.');
  revalidatePath(`/${mode}`);
  return record;
}

export async function deleteFinanceRecordAction(mode: FinanceMode, id: number): Promise<void> {
  const user = await requireUser();
  await withUserContext(user.id, async (tx) => deleteRecord(tx, await financeOwnerId(tx, user.id, mode), mode, id));
  revalidatePath(`/${mode}`);
}
