'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { insertHrRecordAction } from '@/app/hr/actions';

type Staff = { id: number; name: string };
const fields: Record<string, { name: string; label: string; type?: string }[]> = {
  attendance: [{ name: 'attendance_date', label: 'Date', type: 'date' }, { name: 'status', label: 'Status' }, { name: 'check_in', label: 'Check-in', type: 'datetime-local' }, { name: 'check_out', label: 'Check-out', type: 'datetime-local' }, { name: 'working_hours', label: 'Working hours', type: 'number' }, { name: 'overtime', label: 'Overtime hours', type: 'number' }],
  payroll: [{ name: 'period', label: 'Payroll month', type: 'date' }, { name: 'base_salary', label: 'Base salary', type: 'number' }, { name: 'allowances', label: 'Allowances', type: 'number' }, { name: 'deductions', label: 'Deductions', type: 'number' }, { name: 'advances', label: 'Advances', type: 'number' }],
  letters: [{ name: 'letter_type', label: 'Letter type' }, { name: 'title', label: 'Title' }, { name: 'issued_on', label: 'Issued on', type: 'date' }],
  kyc: [{ name: 'document_type', label: 'Document type' }, { name: 'document_number', label: 'Document number' }, { name: 'address_proof', label: 'Address proof' }, { name: 'bank_details_status', label: 'Bank details status' }],
  'work-orders': [{ name: 'title', label: 'Work order' }, { name: 'department', label: 'Department' }, { name: 'due_date', label: 'Due date', type: 'date' }],
};

export function HrRecordManager({ module, staff }: { module: string; staff: Staff[] }) {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(''); const [pending, start] = useTransition();
  const config = fields[module];
  if (!config) return null;
  function submit(form: HTMLFormElement) { const data = new FormData(form); start(async () => { const payload: Record<string, unknown> = { staff_id: Number(data.get('staff_id')) }; config.forEach((f) => { const value = String(data.get(f.name) ?? ''); payload[f.name] = !value ? null : f.type === 'number' ? Number(value) : value; }); const { error } = await insertHrRecordAction(module, payload); setMessage(error || 'Record saved successfully.'); if (!error) { setOpen(false); form.reset(); window.location.reload(); } }); }
  return <Card><CardContent className="flex items-center justify-between gap-4 p-5"><div><p className="font-semibold">Add {module === 'work-orders' ? 'work order' : module.replace('-', ' ')}</p><p className="text-sm text-muted-foreground">Create a record for an existing staff member.</p>{message && <p className="mt-2 text-sm text-[#70481c]">{message}</p>}</div><Button onClick={() => setOpen(true)}>Add record</Button>{open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><Card className="w-full max-w-lg"><CardContent className="space-y-4 p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add record</h2><button onClick={() => setOpen(false)} aria-label="Close">×</button></div><form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="space-y-3"><label className="block text-sm font-medium">Staff<select name="staff_id" required className="mt-1 h-10 w-full rounded-lg border bg-white dark:bg-card px-3">{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>{config.map((field) => <label key={field.name} className="block text-sm font-medium">{field.label}<input name={field.name} type={field.type ?? 'text'} required className="mt-1 h-10 w-full rounded-lg border bg-white dark:bg-card px-3" /></label>)}<Button type="submit" disabled={pending} className="w-full">{pending ? 'Saving…' : 'Save record'}</Button></form></CardContent></Card></div>}</CardContent></Card>;
}
