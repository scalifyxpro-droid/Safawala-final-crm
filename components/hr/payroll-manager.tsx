'use client';
import { useMemo, useState, useTransition } from 'react';
import { Download, Eye, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { savePayrollAction } from '@/app/hr/actions';
type Staff = { id: number; name: string };
type Row = {
  id: number;
  staff_id: number;
  period: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  advances: number;
  net_salary: number;
  status: string;
  staff_members?: { name?: string } | null;
};
const statuses = ['pending', 'processed', 'paid'];
export function PayrollManager({
  initialRecords,
  staff,
}: {
  initialRecords: Row[];
  staff: Staff[];
}) {
  const [rows, setRows] = useState(initialRecords);
  const [month, setMonth] = useState('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [pending, start] = useTransition();
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (month === 'all' || r.period.startsWith(month)) &&
          (status === 'all' || r.status === status) &&
          (r.staff_members?.name ?? '')
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [rows, month, status, search],
  );
  const total = filtered.reduce((n, r) => n + Number(r.net_salary || 0), 0);
  const pendingCount = filtered.filter((r) => r.status === 'pending').length;
  const paid = filtered.filter((r) => r.status === 'paid').length;
  function save(form: HTMLFormElement) {
    const d = new FormData(form);
    const payload = {
      staff_id: Number(d.get('staff_id')),
      period: String(d.get('period')),
      base_salary: Number(d.get('base_salary') || 0),
      allowances: Number(d.get('allowances') || 0),
      deductions: Number(d.get('deductions') || 0),
      advances: Number(d.get('advances') || 0),
      status: String(d.get('status')),
    };
    start(async () => {
      setErrorMessage('');
      const result = await savePayrollAction(editing?.id ? { id: editing.id, ...payload } : payload);
      if (result.error) setErrorMessage(result.error);
      else window.location.reload();
    });
  }
  function csv() {
    const lines = [
      [
        'Employee',
        'Period',
        'Base salary',
        'Allowances',
        'Deductions',
        'Advances',
        'Net salary',
        'Status',
      ],
      ...filtered.map((r) => [
        r.staff_members?.name ?? '',
        r.period,
        String(r.base_salary),
        String(r.allowances),
        String(r.deductions),
        String(r.advances),
        String(r.net_salary),
        r.status,
      ]),
    ];
    const blob = new Blob(
      [
        lines
          .map((l) => l.map((v) => `"${v.replaceAll('"', '""')}"`).join(','))
          .join('\n'),
      ],
      { type: 'text/csv' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const blank: Row = {
    id: 0,
    staff_id: staff[0]?.id ?? 0,
    period: new Date().toISOString().slice(0, 7) + '-01',
    base_salary: 0,
    allowances: 0,
    deductions: 0,
    advances: 0,
    net_salary: 0,
    status: 'pending',
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Payroll total', `₹${total.toLocaleString('en-IN')}`],
          ['Employees', filtered.length],
          ['Pending', pendingCount],
          ['Paid', paid],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <input
            placeholder="Search employee"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm"
            type="search"
          />
          <input
            type="month"
            value={month === 'all' ? '' : month}
            onChange={(e) => setMonth(e.target.value || 'all')}
            className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="flex-1" />
          <Button onClick={() => setEditing(blank)}>Add payroll</Button>
          <Button variant="outline" onClick={csv}>
            <Download />
            CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <FileText />
            PDF
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[#faf8f4] dark:bg-[#241e17] text-left text-xs uppercase tracking-wide text-muted-foreground">
                {[
                  'Employee',
                  'Period',
                  'Base',
                  'Allowances',
                  'Deductions',
                  'Advances',
                  'Net salary',
                  'Status',
                  '',
                ].map((h) => (
                  <th key={h} className="px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-5 py-4 font-medium">
                    {r.staff_members?.name ?? 'Employee'}
                  </td>
                  <td className="px-5 py-4">{r.period.slice(0, 7)}</td>
                  <td className="px-5 py-4">
                    ₹{Number(r.base_salary).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(r.allowances).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(r.deductions).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(r.advances).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4 font-semibold">
                    ₹{Number(r.net_salary).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-4 capitalize">{r.status}</td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreview(r)}
                      aria-label={`View payslip for ${r.staff_members?.name ?? 'employee'}`}
                      title="View payslip"
                    >
                      <Eye />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(r)}
                      aria-label={`Edit payroll for ${r.staff_members?.name ?? 'employee'}`}
                      title="Edit payroll"
                    >
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No payroll records match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {editing.id ? 'Edit salary breakdown' : 'Add payroll'}
              </h2>
              {errorMessage ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(e.currentTarget);
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className="text-sm">
                  Employee
                  <select
                    name="staff_id"
                    defaultValue={editing.staff_id}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Month
                  <input
                    name="period"
                    type="date"
                    defaultValue={editing.period}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    required
                  />
                </label>
                {['base_salary', 'allowances', 'deductions', 'advances'].map(
                  (name) => (
                    <label key={name} className="text-sm capitalize">
                      {name.replace('_', ' ')}
                      <input
                        name={name}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={editing[name as keyof Row] as number}
                        className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                      />
                    </label>
                  ),
                )}
                <label className="text-sm">
                  Status
                  <select
                    name="status"
                    defaultValue={editing.status}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <div className="col-span-full flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-3 p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Payslip preview
              </p>
              <h2 className="text-xl font-semibold">
                {preview.staff_members?.name ?? 'Employee'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Payroll period: {preview.period.slice(0, 7)}
              </p>
              <div className="border-y py-3 text-sm">
                <p>
                  Base salary{' '}
                  <span className="float-right">
                    ₹{Number(preview.base_salary).toLocaleString('en-IN')}
                  </span>
                </p>
                <p>
                  Allowances{' '}
                  <span className="float-right">
                    ₹{Number(preview.allowances).toLocaleString('en-IN')}
                  </span>
                </p>
                <p>
                  Deductions & advances{' '}
                  <span className="float-right">
                    −₹
                    {(
                      Number(preview.deductions) + Number(preview.advances)
                    ).toLocaleString('en-IN')}
                  </span>
                </p>
                <p className="mt-2 font-semibold">
                  Net salary{' '}
                  <span className="float-right">
                    ₹{Number(preview.net_salary).toLocaleString('en-IN')}
                  </span>
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  Print / PDF
                </Button>
                <Button onClick={() => setPreview(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
