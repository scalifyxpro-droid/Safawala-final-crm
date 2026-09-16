'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Clock3, Download, FileText, X } from 'lucide-react';
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
const todayValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const timeValue = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const localDateTime = (date: string, time: string) => {
  if (!time) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};
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
  const [formError, setFormError] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setEditing(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [editing]);
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
    const attendanceDate = String(data.get('attendance_date') || '');
    const checkInTime = String(data.get('check_in') || '');
    const checkOutTime = String(data.get('check_out') || '');
    const checkIn = localDateTime(attendanceDate, checkInTime);
    const checkOut = localDateTime(attendanceDate, checkOutTime);
    if (!Number(data.get('staff_id'))) {
      setFormError('Please select an employee.');
      return;
    }
    if (!attendanceDate) {
      setFormError('Please select an attendance date.');
      return;
    }
    if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      setFormError('Check-out time must be later than check-in time.');
      return;
    }
    const workedMilliseconds = checkIn && checkOut
      ? new Date(checkOut).getTime() - new Date(checkIn).getTime()
      : 0;
    const workingHours = Math.round((workedMilliseconds / 3_600_000) * 100) / 100;
    const payload = {
      staff_id: Number(data.get('staff_id')),
      attendance_date: attendanceDate,
      status: String(data.get('status')),
      check_in: checkIn,
      check_out: checkOut,
      working_hours: workingHours,
      overtime: Math.max(0, Math.round((workingHours - 8) * 100) / 100),
    };
    setFormError('');
    start(async () => {
      const result = await saveAttendanceAction(
        editing?.id ? { id: editing.id, ...payload } : payload,
      );
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setEditing(null);
      window.location.reload();
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
        <CardContent className="grid gap-2 p-4 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:bg-card sm:w-auto"
          >
            <option value="1">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:bg-card sm:w-auto"
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
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:bg-card sm:w-auto"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <span className="hidden flex-1 sm:block" />
          <Button
            className="w-full sm:w-auto"
            disabled={!staff.length}
            onClick={() => {
              setFormError('');
              setEditing({
                id: 0,
                staff_id: 0,
                attendance_date: todayValue(),
                status: 'present',
                check_in: null,
                check_out: null,
                working_hours: 0,
                overtime: 0,
              });
            }}
          >
            Mark attendance
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={exportCsv}>
            <Download />
            CSV
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => window.print()}>
            <FileText />
            PDF
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
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
                      onClick={() => {
                        setFormError('');
                        setEditing(r);
                      }}
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
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !pending) setEditing(null);
          }}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-dialog-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl gap-0 overflow-y-auto rounded-2xl border-border bg-white py-0 shadow-level-3 dark:bg-card sm:max-h-[calc(100dvh-2.5rem)]"
          >
            <CardContent className="p-0">
              <div className="flex items-start gap-3 border-b px-4 py-4 sm:px-6 sm:py-5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900">
                  <Clock3 className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="attendance-dialog-title" className="text-xl font-semibold tracking-tight">
                    {editing.id ? 'Correct Attendance' : 'Mark Attendance'}
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Confirm employee details, date, and check-in/out times.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close attendance form"
                  disabled={pending}
                  onClick={() => setEditing(null)}
                  className="-mr-2 -mt-2 shrink-0"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(e.currentTarget);
                }}
                className="space-y-4 px-4 py-5 sm:px-6 sm:py-6"
              >
                <label className="grid gap-1.5 sm:grid-cols-[108px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-right">Employee *</span>
                  <select
                    name="staff_id"
                    defaultValue={editing.staff_id || ''}
                    required
                    autoFocus
                    className="h-11 min-w-0 w-full rounded-xl border border-input bg-white px-3 text-sm font-medium outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:bg-card"
                  >
                    <option value="" disabled>Select employee</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 sm:grid-cols-[108px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-right">Date *</span>
                  <input
                    name="attendance_date"
                    type="date"
                    defaultValue={editing.attendance_date}
                    className="h-11 min-w-0 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:bg-card"
                    required
                  />
                </label>
                <label className="grid gap-1.5 sm:grid-cols-[108px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-right">Status *</span>
                  <select
                    name="status"
                    defaultValue={editing.status}
                    required
                    className="h-11 min-w-0 w-full rounded-xl border border-input bg-white px-3 text-sm font-medium capitalize outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:bg-card"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 sm:grid-cols-[108px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-right">Check in</span>
                  <input
                    name="check_in"
                    type="time"
                    defaultValue={timeValue(editing.check_in)}
                    className="h-11 min-w-0 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:bg-card"
                  />
                </label>
                <label className="grid gap-1.5 sm:grid-cols-[108px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-right">Check out</span>
                  <input
                    name="check_out"
                    type="time"
                    defaultValue={timeValue(editing.check_out)}
                    className="h-11 min-w-0 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:bg-card"
                  />
                </label>
                <p className="pl-0 text-xs leading-5 text-muted-foreground sm:pl-[124px]">
                  Working and overtime hours are calculated automatically from these times.
                </p>
                {formError ? (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    {formError}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 border-t pt-4 sm:flex sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : editing.id ? 'Save correction' : 'Mark Attendance'}
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
