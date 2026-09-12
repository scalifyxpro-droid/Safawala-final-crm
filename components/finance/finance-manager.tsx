'use client';

import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createFinanceRecordAction, updateFinanceRecordAction, deleteFinanceRecordAction } from '@/app/finance/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type FinanceMode = 'challans' | 'vouchers' | 'expenses';
export type FinanceRecord = Record<string, unknown> & { id: number };
const textValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const config = {
  challans: { title: 'Delivery Challans', subtitle: 'Create and track delivery receipts and pickup sheets', add: 'Create Challan', table: 'challans', search: 'Search party, mobile, or challan number' },
  vouchers: { title: 'Payment & Receipt Vouchers', subtitle: 'Track customer receipts and company payments', add: 'New Voucher', table: 'vouchers', search: 'Search voucher, account, or booking' },
  expenses: { title: 'Expenses', subtitle: 'Track and manage business expenses', add: 'Add Expense', table: 'expenses', search: 'Search category, vendor, or description' },
} as const;

export function FinanceManager({ mode, initialRecords, loadError, email }: { mode: FinanceMode; initialRecords: FinanceRecord[]; loadError?: string; email: string }) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceRecord | null>(null);
  const [selected, setSelected] = useState<FinanceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(loadError ?? '');
  const [form, setForm] = useState<Record<string, string>>({});
  const meta = config[mode];
  const filtered = records.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const startAdd = () => { setEditing(null); setError(''); setForm({ date: new Date().toISOString().slice(0, 10), status: 'active', type: mode === 'vouchers' ? 'receipt' : 'active', payment_mode: 'cash', prepared_by: email.split('@')[0] }); setOpen(true); };
  const startEdit = (row: FinanceRecord) => { setEditing(row); setError(''); setForm({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, textValue(value)])), date: textValue(row.challan_date ?? row.voucher_date ?? row.expense_date).slice(0, 10), type: textValue(row.voucher_type ?? row.status) }); setOpen(true); };
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = mode === 'challans' ? { challan_number: form.challan_number, challan_date: form.date, party_name: form.party_name, mobile: form.mobile || null, amount: Number(form.amount || 0), status: form.status || 'active', notes: form.notes || null } : mode === 'vouchers' ? { voucher_number: form.voucher_number, voucher_type: form.type || 'receipt', voucher_date: form.date, payment_mode: form.payment_mode || 'cash', amount: Number(form.amount || 0), account_name: form.account_name, narration: form.narration || null, receiver_name: form.receiver_name || null, prepared_by: form.prepared_by || null } : { amount: Number(form.amount || 0), expense_date: form.date, category: form.category || 'Uncategorized', receipt_number: form.receipt_number || null, description: form.description || null };
    try {
      const saved = editing ? await updateFinanceRecordAction(mode, editing.id, payload) : await createFinanceRecordAction(mode, payload);
      setOpen(false);
      setRecords((current) => editing ? current.map((row) => row.id === editing.id ? saved : row) : [saved, ...current]);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to save record.'));
    } finally {
      setSaving(false);
    }
  }
  async function remove(row: FinanceRecord) {
    if (!window.confirm('Delete this record?')) return;
    try {
      await deleteFinanceRecordAction(mode, row.id);
      setRecords((current) => current.filter((item) => item.id !== row.id));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to delete record.'));
    }
  }
  const columns = mode === 'challans' ? [['challan_number', 'Challan No.'], ['challan_date', 'Date'], ['party_name', 'Party'], ['mobile', 'Mobile'], ['amount', 'Amount'], ['status', 'Status']] : mode === 'vouchers' ? [['voucher_number', 'Voucher No.'], ['voucher_date', 'Date'], ['voucher_type', 'Type'], ['account_name', 'Particulars'], ['payment_mode', 'Mode'], ['amount', 'Amount']] : [['expense_date', 'Date'], ['category', 'Category'], ['description', 'Description'], ['receipt_number', 'Receipt #'], ['amount', 'Amount']];
  function exportCsv() {
    const headers = columns.map(([, label]) => label);
    const rows = filtered.map((row) => columns.map(([key]) => textValue(row[key])));
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `safawala-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <div className="mx-auto max-w-[1440px] space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold">{meta.title}</h1><p className="mt-1 text-sm text-muted-foreground">{meta.subtitle}</p></div><div className="flex flex-wrap gap-2">{mode === 'expenses' ? <><Button variant="outline" onClick={exportCsv}><Download />CSV</Button><Button variant="outline" onClick={() => window.print()}><FileText />PDF</Button></> : null}<Button onClick={startAdd}><Plus />{meta.add}</Button></div></div>{error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}<Card className="border-border shadow-level-1"><CardContent className="p-4"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={meta.search} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></CardContent></Card><Card className="border-border shadow-level-1"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-[#faf8f4] text-xs uppercase tracking-wide text-muted-foreground"><tr>{columns.map(([, label]) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}<th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead><tbody>{filtered.length ? filtered.map((row) => <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-[#fcfaf7]"><>{columns.map(([key]) => <td key={key} className="px-4 py-3">{key === 'amount' ? `₹${Number(row[key] || 0).toLocaleString('en-IN')}` : textValue(row[key]) || '—'}</td>)}</><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="View" title="View" onClick={() => setSelected(row)}><Eye /></Button><Button variant="ghost" size="icon" aria-label="Edit" title="Edit" onClick={() => startEdit(row)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="Delete" title="Delete" onClick={() => remove(row)}><Trash2 className="text-destructive" /></Button></div></td></tr>) : <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">No records found. Create the first one to get started.</td></tr>}</tbody></table></div></CardContent></Card>{selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><div className="w-full max-w-xl rounded-2xl border border-border bg-white p-6 shadow-level-2 dark:bg-card"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">View {meta.title.slice(0, -1)}</h2><p className="mt-1 text-xs text-muted-foreground">Record details</p></div><Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X /></Button></div><dl className="mt-5 grid gap-3 sm:grid-cols-2">{columns.map(([key, label]) => <div key={key} className="rounded-lg border border-border/70 bg-[#fcfaf7] p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{key === 'amount' ? `₹${Number(selected[key] || 0).toLocaleString('en-IN')}` : textValue(selected[key]) || '—'}</dd></div>)}</dl><div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></div></div></div> : null}{open ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-white p-6 shadow-level-2 dark:bg-card"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-semibold">{editing ? `Edit ${meta.title.slice(0, -1)}` : meta.add}</h2><p className="mt-1 text-xs text-muted-foreground">Saved to your secure CRM records.</p></div><Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X /></Button></div><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">{mode === 'challans' ? <><Field label="Party name *" value={form.party_name} onChange={(v) => setField('party_name', v)} required /><Field label="Mobile" value={form.mobile} onChange={(v) => setField('mobile', v)} /><Field label="Challan number" value={form.challan_number} onChange={(v) => setField('challan_number', v)} /><Field label="Amount" type="number" value={form.amount} onChange={(v) => setField('amount', v)} required /><Field label="Date *" type="date" value={form.date} onChange={(v) => setField('date', v)} required /><SelectField label="Status" value={form.status} options={['active', 'closed']} onChange={(v) => setField('status', v)} /><Field className="sm:col-span-2" label="Notes" value={form.notes} onChange={(v) => setField('notes', v)} /></> : mode === 'vouchers' ? <><SelectField label="Voucher type *" value={form.type} options={['receipt', 'payment']} onChange={(v) => setField('type', v)} /><SelectField label="Payment mode *" value={form.payment_mode} options={['cash', 'upi', 'card', 'bank_transfer', 'other']} onChange={(v) => setField('payment_mode', v)} /><Field label="Account / particulars *" value={form.account_name} onChange={(v) => setField('account_name', v)} required /><Field label="Amount (₹) *" type="number" value={form.amount} onChange={(v) => setField('amount', v)} required /><Field label="Date *" type="date" value={form.date} onChange={(v) => setField('date', v)} required /><Field label="Receiver name" value={form.receiver_name} onChange={(v) => setField('receiver_name', v)} /><Field className="sm:col-span-2" label="Narration" value={form.narration} onChange={(v) => setField('narration', v)} /></> : <><Field label="Amount (₹) *" type="number" value={form.amount} onChange={(v) => setField('amount', v)} required /><Field label="Date *" type="date" value={form.date} onChange={(v) => setField('date', v)} required /><Field label="Category *" value={form.category} onChange={(v) => setField('category', v)} required /><Field label="Receipt number" value={form.receipt_number} onChange={(v) => setField('receipt_number', v)} /><Field className="sm:col-span-2" label="Description" value={form.description} onChange={(v) => setField('description', v)} /></>}<div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : meta.add}</Button></div></form></div></div> : null}</div>;
}

function Field({ label, value, onChange, type = 'text', required, className = '' }: { label: string; value?: string; onChange: (value: string) => void; type?: string; required?: boolean; className?: string }) { const isMobile = label.toLowerCase().includes('mobile'); return <label className={`grid gap-1.5 text-sm font-medium text-foreground ${className}`}>{label}<input required={required} type={type} inputMode={isMobile ? 'numeric' : undefined} maxLength={isMobile ? 10 : undefined} pattern={isMobile ? '[0-9]{10}' : undefined} value={value ?? ''} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 10))} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (value: string) => void }) { return <label className="grid gap-1.5 text-sm font-medium">{label}<select value={value ?? options[0]} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm"><option value="" disabled>Select</option>{options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>; }
