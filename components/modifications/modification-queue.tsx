'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  PackageCheck,
  Phone,
  Play,
  RotateCcw,
  Search,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import {
  modificationDetails,
} from '@/lib/modifications';
import { logModificationActivityAction } from '@/app/modifications/actions';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { BookingPdfButton, type PdfBooking } from '@/components/bookings/booking-pdf-button';

type ModificationStatus = 'pending' | 'in_progress' | 'completed';
type QueueFilter = 'all' | ModificationStatus | 'urgent';

type Activity = {
  id: number;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type ModificationBooking = {
  id: number;
  booking_number: string;
  booking_type: string;
  is_quote?: boolean;
  status: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  notes: string | null;
  created_at: string;
  pickup_date: string | null;
  due_date: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  security_deposit: number;
  total: number;
  paid_amount: number;
  balance_amount: number;
  customers: { name: string; phone: string; address: string | null } | null;
  staff_members: { name: string } | null;
  booking_items: { id: number; item_name: string; quantity: number }[];
  booking_activity: Activity[];
};

const fieldClass =
  'h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';
const actionNames = new Set([
  'modification_started',
  'modification_completed',
  'modification_reopened',
]);

function indiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function dayDifference(date: string, from = indiaDate()) {
  const start = new Date(`${from}T00:00:00+05:30`).getTime();
  const end = new Date(`${date}T00:00:00+05:30`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function currentStatus(activities: Activity[]): ModificationStatus {
  const latest = [...activities]
    .filter((activity) => actionNames.has(activity.action))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest?.action === 'modification_completed') return 'completed';
  if (latest?.action === 'modification_started') return 'in_progress';
  return 'pending';
}

function urgency(booking: ModificationBooking) {
  const days = dayDifference(booking.event_date);
  const details = modificationDetails(booking.notes);
  const modificationDays = details.scheduledDate
    ? dayDifference(details.scheduledDate)
    : days;
  if (days < 0)
    return {
      rank: 0,
      label: 'Delivery overdue',
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  if (days === 0)
    return {
      rank: 1,
      label: 'Delivery today',
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  if (days === 1)
    return {
      rank: 2,
      label: 'Delivery tomorrow',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  if (modificationDays <= 0)
    return {
      rank: 3,
      label: 'Work due today',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  return {
    rank: 10 + days,
    label: `${days} days to delivery`,
    className: 'border-stone-200 bg-stone-50 text-stone-700 dark:border-border dark:bg-muted dark:text-muted-foreground',
  };
}

export function ModificationQueue({
  initialBookings,
  loadError,
  staffMode = false,
}: {
  initialBookings: ModificationBooking[];
  loadError: string;
  staffMode?: boolean;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<ModificationBooking | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState(loadError);

  const rows = useMemo(
    () =>
      bookings
        .map((booking) => ({
          booking,
          status: currentStatus(booking.booking_activity),
          details: modificationDetails(booking.notes),
          urgency: urgency(booking),
        }))
        .sort((a, b) =>
          a.status === 'completed' && b.status !== 'completed'
            ? 1
            : b.status === 'completed' && a.status !== 'completed'
              ? -1
              : a.urgency.rank - b.urgency.rank,
        ),
    [bookings],
  );
  const counts = {
    pending: rows.filter((row) => row.status === 'pending').length,
    inProgress: rows.filter((row) => row.status === 'in_progress').length,
    completed: rows.filter((row) => row.status === 'completed').length,
    urgent: rows.filter(
      (row) => row.status !== 'completed' && row.urgency.rank <= 3,
    ).length,
  };
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const searchable =
      `${row.booking.booking_number} ${row.booking.customers?.name ?? ''} ${row.booking.customers?.phone ?? ''} ${row.details.instructions} ${row.booking.booking_items.map((item) => item.item_name).join(' ')}`.toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'urgent'
        ? row.status !== 'completed' && row.urgency.rank <= 3
        : row.status === filter);
    return matchesSearch && matchesFilter;
  });
  const focusRows = rows
    .filter((row) => row.status !== 'completed' && row.urgency.rank <= 3)
    .slice(0, 3);
  const modificationPageCount = Math.max(
    1,
    Math.ceil(visibleRows.length / pageSize),
  );
  const safeModificationPage = Math.min(page, modificationPageCount);
  const pagedRows = visibleRows.slice(
    (safeModificationPage - 1) * pageSize,
    safeModificationPage * pageSize,
  );

  async function changeStatus(
    booking: ModificationBooking,
    status: ModificationStatus,
  ) {
    const action =
      status === 'pending'
        ? 'modification_started'
        : status === 'in_progress'
          ? 'modification_completed'
          : 'modification_reopened';
    setBusyId(booking.id);
    setMessage('');
    const { data, error } = await logModificationActivityAction(booking.id, action);
    if (error || !data) setMessage(error || 'Activity could not be recorded.');
    else {
      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id
            ? {
                ...item,
                booking_activity: [...item.booking_activity, data as Activity],
              }
            : item,
        ),
      );
      setSelected((current) =>
        current?.id === booking.id
          ? {
              ...current,
              booking_activity: [...current.booking_activity, data as Activity],
            }
          : current,
      );
    }
    setBusyId(null);
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title="Modifications"
        subtitle={staffMode ? 'Work assigned to the modification department' : 'Delivery-first workshop queue for Sale bookings'}
        backHref={staffMode ? null : '/dashboard'}
        actions={!staffMode ? (
          <Button
            size="sm"
            render={<Link href="/bookings/new?type=sale" />}
          >
            <span className="hidden sm:inline">Create sale booking</span>
            <ArrowRight />
          </Button>
        ) : undefined}
      />

      {message ? (
        <Alert variant="destructive">
          <AlertTitle>Modification activity could not be updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<AlertTriangle />}
          label="Needs attention"
          value={counts.urgent}
          note="Due today or delivery tomorrow"
          tone="danger"
        />
        <Metric
          icon={<CalendarClock />}
          label="Pending"
          value={counts.pending}
          note="Waiting to be started"
          tone="warning"
        />
        <Metric
          icon={<Wrench />}
          label="In progress"
          value={counts.inProgress}
          note="Currently in the workshop"
        />
        <Metric
          icon={<CheckCircle2 />}
          label="Completed"
          value={counts.completed}
          note="Ready for delivery"
          tone="success"
        />
      </div>

      {focusRows.length ? (
        <Card className="gap-0 border-[#dfc9a6] py-0 shadow-level-2 ring-0">
          <CardHeader className="border-b bg-[linear-gradient(90deg,#fbf3e7,#fff)] px-5 py-4 dark:bg-[linear-gradient(90deg,#241e17,#1c1712)]">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary text-white">
                <Clock3 className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base">Today&apos;s focus</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Start with these jobs to protect the nearest deliveries.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-3">
            {focusRows.map((row) => (
              <button
                key={row.booking.id}
                type="button"
                onClick={() => setSelected(row.booking)}
                className="rounded-xl border bg-white dark:bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-level-1"
              >
                <span className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className={row.urgency.className}>
                    {row.urgency.label}
                  </Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </span>
                <strong className="mt-3 block truncate text-sm">
                  {row.booking.customers?.name || 'Customer'}
                </strong>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {row.details.instructions}
                </span>
                <span className="mt-3 block text-[11px] font-medium text-primary">
                  {row.booking.booking_number} ·{' '}
                  {row.booking.booking_items.length} items
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
        <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Modification work queue</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {visibleRows.length} of {rows.length} modification jobs
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search modifications</span>
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search customer, booking or item…"
                  className={`${fieldClass} pl-9`}
                />
              </label>
              <label>
                <span className="sr-only">Filter modification status</span>
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as QueueFilter);
                    setPage(1);
                  }}
                  className={`${fieldClass} sm:w-40`}
                >
                  <option value="all">All work</option>
                  <option value="urgent">Needs attention</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
          </div>
        </CardHeader>
        <ListPagination
          total={visibleRows.length}
          page={safeModificationPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="modification jobs"
        />
        <CardContent className="p-0">
          {visibleRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="border-b bg-[#f7f4ef] dark:bg-[#241e17] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">
                      Priority & booking
                    </th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Modification</th>
                    <th className="px-5 py-3 font-medium">Scheduled work</th>
                    <th className="px-5 py-3 font-medium">Delivery</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <ModificationRow
                      key={row.booking.id}
                      row={row}
                      busy={busyId === row.booking.id}
                      onOpen={() => setSelected(row.booking)}
                      onAdvance={() => changeStatus(row.booking, row.status)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyQueue
              onClear={() => {
                setSearch('');
                setFilter('all');
                setPage(1);
              }}
            />
          )}
        </CardContent>
      </Card>
      {selected ? (
        <ModificationDialog
          booking={selected}
          staffMode={staffMode}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          onAdvance={() =>
            changeStatus(selected, currentStatus(selected.booking_activity))
          }
        />
      ) : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const colors =
    tone === 'danger'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : tone === 'success'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-accent text-primary ring-[#e4d2b6]';
  return (
    <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 [&_svg]:size-5 ${colors}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ModificationRow({
  row,
  busy,
  onOpen,
  onAdvance,
}: {
  row: ReturnType<typeof makeRow>;
  busy: boolean;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const statusInfo = statusPresentation(row.status);
  return (
    <tr className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]">
      <td className="px-5 py-4">
        <Badge variant="outline" className={row.urgency.className}>
          {row.urgency.label}
        </Badge>
        <Link
          href={`/bookings/${row.booking.id}`}
          className="mt-2 block text-xs font-semibold text-primary hover:underline"
        >
          {row.booking.booking_number}
        </Link>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold">
          {row.booking.customers?.name || 'Customer not found'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.booking.customers?.phone || 'Phone not added'}
        </p>
      </td>
      <td className="max-w-[320px] px-5 py-4">
        <Badge variant="outline" className="mb-2 border-[#dfc9a6] bg-[#fbf3e7] text-primary">
          {row.details.type}
        </Badge>
        <p className="line-clamp-2 text-xs leading-5">
          {row.details.instructions}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {row.booking.booking_items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}{' '}
          units · {row.booking.booking_items.length} product lines
        </p>
      </td>
      <td className="px-5 py-4">
        <p className="font-medium">
          {row.details.scheduledDate
            ? friendlyDate(row.details.scheduledDate)
            : 'Not scheduled'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {friendlyTime(row.details.scheduledTime)}
        </p>
      </td>
      <td className="px-5 py-4">
        <p className="font-medium">{friendlyDate(row.booking.event_date)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {friendlyTime(row.booking.event_time)}
        </p>
      </td>
      <td className="px-5 py-4">
        <Badge variant="outline" className={statusInfo.className}>
          {statusInfo.label}
        </Badge>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {row.booking.staff_members?.name || 'Unassigned'}
        </p>
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onOpen}>
            View
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={onAdvance}
            aria-label={`${statusInfo.actionLabel} for ${row.booking.booking_number}`}
          >
            {statusInfo.actionIcon}
            {busy ? 'Saving…' : statusInfo.actionLabel}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function makeRow(booking: ModificationBooking) {
  return {
    booking,
    status: currentStatus(booking.booking_activity),
    details: modificationDetails(booking.notes),
    urgency: urgency(booking),
  };
}

function statusPresentation(status: ModificationStatus) {
  if (status === 'completed')
    return {
      label: 'Completed',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      actionLabel: 'Reopen',
      actionIcon: <RotateCcw />,
    };
  if (status === 'in_progress')
    return {
      label: 'In progress',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
      actionLabel: 'Complete',
      actionIcon: <Check />,
    };
  return {
    label: 'Pending',
    className: 'border-stone-200 bg-stone-50 text-stone-700 dark:border-border dark:bg-muted dark:text-muted-foreground',
    actionLabel: 'Start work',
    actionIcon: <Play />,
  };
}

function ModificationDialog({
  booking,
  staffMode,
  busy,
  onClose,
  onAdvance,
}: {
  booking: ModificationBooking;
  staffMode: boolean;
  busy: boolean;
  onClose: () => void;
  onAdvance: () => void;
}) {
  const details = modificationDetails(booking.notes);
  const status = currentStatus(booking.booking_activity);
  const statusInfo = statusPresentation(status);
  const priority = urgency(booking);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#211d18]/70 p-4 backdrop-blur-sm">
      <dialog
        open
        aria-labelledby="modification-dialog-title"
        className="relative m-0 max-h-[92dvh] w-full max-w-3xl overflow-hidden rounded-[24px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.4)]"
      >
        <div className="flex items-start justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-5 sm:px-6">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-[#e4d2b6]">
              <Wrench className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="modification-dialog-title"
                  className="text-lg font-semibold tracking-[-0.03em]"
                >
                  {booking.booking_number}
                </h2>
                <Badge variant="outline" className={priority.className}>
                  {priority.label}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sale modification work order
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modification details"
            className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[calc(92dvh-160px)] space-y-5 overflow-y-auto p-5 sm:p-6">
          <Card className="gap-0 border-[#dfc9a6] py-0 shadow-none ring-0">
            <CardHeader className="border-b bg-[#fbf3e7] dark:bg-[#241e17] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">Work instructions</CardTitle>
                <Badge variant="outline">{details.type}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <p className="whitespace-pre-wrap text-sm leading-6">
                {details.instructions}
              </p>
              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <Info
                  icon={<CalendarClock />}
                  label="Modification schedule"
                  value={`${details.scheduledDate ? friendlyDate(details.scheduledDate) : 'Not scheduled'}${details.scheduledTime ? ` · ${friendlyTime(details.scheduledTime)}` : ''}`}
                />
                <Info
                  icon={<Clock3 />}
                  label="Customer delivery"
                  value={`${friendlyDate(booking.event_date)}${booking.event_time ? ` · ${friendlyTime(booking.event_time)}` : ''}`}
                />
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-5 sm:grid-cols-2">
            <Card className="gap-0 py-0 shadow-none ring-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">Customer & delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <Info
                  icon={<UserRound />}
                  label="Customer"
                  value={booking.customers?.name || 'Not available'}
                />
                <Info
                  icon={<Phone />}
                  label="Phone"
                  value={booking.customers?.phone || 'Not available'}
                />
                <Info
                  icon={<MapPin />}
                  label="Delivery location"
                  value={
                    booking.event_location ||
                    booking.customers?.address ||
                    'Not added'
                  }
                />
              </CardContent>
            </Card>
            <Card className="gap-0 py-0 shadow-none ring-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">Products to modify</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                {booking.booking_items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border bg-white dark:bg-card px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <PackageCheck className="size-4 text-primary" />
                      {item.item_name}
                    </span>
                    <Badge variant="outline">Qty {item.quantity}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="flex justify-end border-t bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4 sm:px-6">
          <div className="flex gap-2 sm:justify-end">
            {!staffMode ? (
              <BookingPdfButton booking={booking as unknown as PdfBooking} label="Print / PDF" />
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" disabled={busy} onClick={onAdvance}>
              {statusInfo.actionIcon}
              {busy ? 'Saving…' : statusInfo.actionLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
function EmptyQueue({ onClear }: { onClear: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
          <Wrench />
        </span>
        <h3 className="mt-4 font-semibold">No modification work found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          New Sale bookings marked for modification will appear here
          automatically.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={onClear}
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
}
