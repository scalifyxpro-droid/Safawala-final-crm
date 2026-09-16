'use client';
import { useMemo, useState, useTransition } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { saveAttendanceAction } from '@/app/hr/actions';

type Staff = { id: number; name: string };
type RecordRow = {
  id: number;
  staff_id: number;
  attendance_date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  working_hours: number;
  overtime: number;
  staff_members?: { name?: string } | null;
};
const statuses = ['present', 'absent', 'late', 'half_day', 'on_leave'];
export function AttendanceManager({
  initialRecords,
  staff,
}: {
  initialRecords: RecordRow[];
  staff: Staff[];
}) {
  const [records] = useState(initialRecords);
  const [range, setRange] = useState('30');
  const [staffFilter, setStaffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [pending, start] = useTransition();
  const filtered = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - Number(range) + 1);
    return records.filter(
      (r) =>
        new Date(`${r.attendance_date}T00:00:00`) >= since &&
        (staffFilter === 'all' || String(r.staff_id) === staffFilter) &&
        (statusFilter === 'all' || r.status === statusFilter),
    );
  }, [records, range, staffFilter, statusFilter]);
  const kpis = {
    total: filtered.length,
    present: filtered.filter((r) => r.status === 'present').length,
    late: filtered.filter((r) => r.status === 'late').length,
    overtime: filtered.reduce((n, r) => n + Number(r.overtime || 0), 0),
  };
  function save(form: HTMLFormElement) {
    const data = new FormData(form);
    const payload = {
      staff_id: Number(data.get('staff_id')),
      attendance_date: String(data.get('attendance_date')),
      status: String(data.get('status')),
      check_in: data.get('check_in')
        ? new Date(String(data.get('check_in'))).toISOString()
        : null,
      check_out: data.get('check_out')
        ? new Date(String(data.get('check_out'))).toISOString()
        : null,
      working_hours: Number(data.get('working_hours') || 0),
      overtime: Number(data.get('overtime') || 0),
    };
    start(async () => {
      const result = await saveAttendanceAction(
        editing?.id ? { id: editing.id, ...payload } : payload,
      );
      if (!result.error) window.location.reload();
    });
  }
  function exportCsv() {
    const rows = [
      [
        'Employee',
        'Date',
        'Status',
        'Check in',
        'Check out',
        'Working hours',
        'Overtime',
      ],
      ...filtered.map((r) => [
        r.staff_members?.name ?? '',
        r.attendance_date,
        r.status,
        r.check_in ?? '',
        r.check_out ?? '',
        String(r.working_hours ?? ''),
        String(r.overtime ?? ''),
      ]),
    ];
    const blob = new Blob(
      [
        rows
          .map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(','))
          .join('\n'),
      ],
      { type: 'text/csv' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'attendance.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="space-y-5">
      <div className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {[
          ['Total records', kpis.total],
          ['Present', kpis.present],
          ['Late', kpis.late],
          ['Overtime hours', kpis.overtime.toFixed(1)],
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
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm"
          >
            <option value="1">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm"
          >
            <option value="all">All employees</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <Button
            onClick={() =>
              setEditing({
                id: 0,
                staff_id: staff[0]?.id ?? 0,
                attendance_date: new Date().toISOString().slice(0, 10),
                status: 'present',
                check_in: null,
                check_out: null,
                working_hours: 0,
                overtime: 0,
              })
            }
          >
            Mark attendance
          </Button>
          <Button variant="outline" onClick={exportCsv}>
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
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Hours</th>
                <th className="px-5 py-3">Overtime</th>
                <th aria-label="Actions" className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-5 py-4 font-medium">
                    {r.staff_members?.name ?? 'Employee'}
                  </td>
                  <td className="px-5 py-4">{r.attendance_date}</td>
                  <td className="px-5 py-4 capitalize">
                    {r.status.replace('_', ' ')}
                  </td>
                  <td className="px-5 py-4">{r.working_hours ?? 0}</td>
                  <td className="px-5 py-4">{r.overtime ?? 0}</td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(r)}
                    >
                      Correct
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No attendance records match these filters.
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
            <CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">
                {editing.id ? 'Correct attendance' : 'Mark attendance'}
              </h2>
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
                  Date
                  <input
                    name="attendance_date"
                    type="date"
                    defaultValue={editing.attendance_date}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                    required
                  />
                </label>
                <label className="text-sm">
                  Status
                  <select
                    name="status"
                    defaultValue={editing.status}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Working hours
                  <input
                    name="working_hours"
                    type="number"
                    step="0.25"
                    defaultValue={editing.working_hours}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  />
                </label>
                <label className="text-sm">
                  Overtime
                  <input
                    name="overtime"
                    type="number"
                    step="0.25"
                    defaultValue={editing.overtime}
                    className="mt-1 h-10 w-full rounded border bg-white dark:bg-card px-2"
                  />
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
    </div>
  );
}
