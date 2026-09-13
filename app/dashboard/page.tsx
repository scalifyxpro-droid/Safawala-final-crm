import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileText,
  ListChecks,
  PackageCheck,
  Plus,
  Route,
} from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import {
  CalendarDayGrid,
  type CalendarBooking,
  type LockedDate,
} from '@/components/bookings/calendar-day-grid';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { friendlyDate, money, statusLabel, statusTone } from '@/lib/bookings';
import { currentStageSummary, listActiveJobs } from '@/lib/event-jobs/store';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// A booking counts as "live" when it's an actual booking, or a quote that has
// moved past draft/cancelled (mirrors the original `.or('is_quote.eq.false,
// and(is_quote.eq.true,status.not.in.(draft,cancelled))')` PostgREST filter).
const LIVE_BOOKING_FILTER = `(b.is_quote = false or (b.is_quote = true and b.status not in ('draft','cancelled')))`;

type UpcomingBookingRow = {
  id: number;
  booking_number: string;
  booking_type: string;
  status: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  customers: { name: string } | null;
};

type RecentBookingRow = {
  id: number;
  booking_number: string;
  booking_type: string;
  status: string;
  payment_status: string;
  event_name: string;
  event_date: string;
  total: number;
  customers: { name: string } | null;
};

type EventJobStateRow = { state: unknown };
type PaymentRow = { paid_amount: number | null; created_at: string | null };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const today = new Date().toISOString().slice(0, 10);

  const calendarBase = new Date();
  const calendarYear = calendarBase.getFullYear();
  const calendarMonth = calendarBase.getMonth();
  const calendarFirst = new Date(calendarYear, calendarMonth, 1);
  const calendarLast = new Date(calendarYear, calendarMonth + 1, 0);
  const calendarPad = (value: number) => String(value).padStart(2, '0');
  const calendarStart = `${calendarYear}-${calendarPad(calendarMonth + 1)}-01`;
  const calendarEnd = `${calendarYear}-${calendarPad(calendarMonth + 1)}-${calendarPad(calendarLast.getDate())}`;

  let total = 0;
  let quoteTotal = 0;
  let confirmed = 0;
  let completed = 0;
  let upcomingRows: UpcomingBookingRow[] = [];
  let modificationCount = 0;
  let eventJobs: EventJobStateRow[] = [];
  let paymentRows: PaymentRow[] = [];
  let recent: RecentBookingRow[] = [];
  let error: Error | null = null;
  let jobTrackerJobs: Awaited<ReturnType<typeof listActiveJobs>> = [];
  let calendarRows: unknown[] = [];
  let calendarLockedRaw: LockedDate[] = [];

  try {
    const result = await withUserContext(user.id, async (tx) => {
      const [
        totalRows,
        quoteTotalRows,
        confirmedRows,
        completedRows,
        upcoming,
        modificationRows,
        eventJobRows,
        payments,
        recentRows,
        activeJobs,
        calendar,
        calendarLocked,
      ] = await Promise.all([
        tx.unsafe(
          `select count(*)::int as count from public.bookings b where ${LIVE_BOOKING_FILTER}`,
        ),
        tx.unsafe(
          `select count(*)::int as count from public.bookings b where b.is_quote = true and b.status = 'draft'`,
        ),
        tx.unsafe(
          `select count(*)::int as count from public.bookings b where ${LIVE_BOOKING_FILTER} and b.status = 'confirmed'`,
        ),
        tx.unsafe(
          `select count(*)::int as count from public.bookings b where ${LIVE_BOOKING_FILTER} and b.status = 'completed'`,
        ),
        tx.unsafe(
          `select b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.event_name, b.event_date,
             b.event_time, b.event_location, b.total,
             case when c.id is null then null else json_build_object('name', c.name) end as customers
           from public.bookings b
           left join public.customers c on c.id = b.customer_id
           where ${LIVE_BOOKING_FILTER} and b.event_date >= $1
           order by b.event_date asc
           limit 8`,
          [today],
        ),
        tx.unsafe(
          `select count(*)::int as count from public.bookings b
           where b.booking_type = 'sale' and ${LIVE_BOOKING_FILTER} and b.notes ilike '%SALE MODIFICATION REQUIRED%'`,
        ),
        tx.unsafe(`select state from public.event_jobs`),
        tx.unsafe(
          `select customer_id, total, paid_amount, payment_status, created_at from public.bookings b where ${LIVE_BOOKING_FILTER}`,
        ),
        tx.unsafe(
          `select b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.event_name, b.event_date, b.total,
             case when c.id is null then null else json_build_object('name', c.name) end as customers
           from public.bookings b
           left join public.customers c on c.id = b.customer_id
           where ${LIVE_BOOKING_FILTER}
           order by b.created_at desc
           limit 6`,
        ),
        listActiveJobs().catch(() => []),
        tx.unsafe(
          `select
             b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.is_quote, b.event_name,
             b.event_date, b.event_time, b.event_location, b.pickup_date, b.due_date, b.subtotal, b.discount,
             b.tax, b.security_deposit, b.total, b.paid_amount, b.balance_amount, b.notes,
             case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers,
             coalesce(items.rows, '[]'::json) as booking_items
           from public.bookings b
           left join public.customers c on c.id = b.customer_id
           left join lateral (
             select json_agg(json_build_object(
               'item_name', bi.item_name, 'quantity', bi.quantity, 'unit_price', bi.unit_price,
               'line_total', bi.line_total, 'product_id', bi.product_id,
               'products', case when p.id is null then null else json_build_object('image_urls', p.image_urls, 'barcode', p.barcode) end
             )) as rows
             from public.booking_items bi
             left join public.products p on p.id = bi.product_id
             where bi.booking_id = b.id
           ) items on true
           where ${LIVE_BOOKING_FILTER} and b.event_date >= $1 and b.event_date <= $2
           order by b.event_date`,
          [calendarStart, calendarEnd],
        ),
        // Locked dates from the Leads Center should show as blocked here too — if the
        // leads_center migration isn't applied yet this just comes back empty.
        tx
          .unsafe(
            `select id, locked_date, label, notes from public.lead_locked_dates
           where owner_id = $1 and locked_date >= $2 and locked_date <= $3`,
            [user.id, calendarStart, calendarEnd],
          )
          .catch(() => []),
      ]);
      return {
        total: (totalRows as unknown as { count: number }[])[0]?.count ?? 0,
        quoteTotal:
          (quoteTotalRows as unknown as { count: number }[])[0]?.count ?? 0,
        confirmed:
          (confirmedRows as unknown as { count: number }[])[0]?.count ?? 0,
        completed:
          (completedRows as unknown as { count: number }[])[0]?.count ?? 0,
        upcoming: upcoming as unknown as UpcomingBookingRow[],
        modificationCount:
          (modificationRows as unknown as { count: number }[])[0]?.count ?? 0,
        eventJobRows: eventJobRows as unknown as EventJobStateRow[],
        payments: payments as unknown as PaymentRow[],
        recentRows: recentRows as unknown as RecentBookingRow[],
        activeJobs,
        calendar,
        calendarLocked: calendarLocked as unknown as LockedDate[],
      };
    });
    total = result.total;
    quoteTotal = result.quoteTotal;
    confirmed = result.confirmed;
    completed = result.completed;
    upcomingRows = result.upcoming;
    modificationCount = result.modificationCount;
    eventJobs = result.eventJobRows;
    paymentRows = result.payments;
    recent = result.recentRows;
    jobTrackerJobs = result.activeJobs;
    calendarRows = result.calendar;
    calendarLockedRaw = result.calendarLocked;
  } catch (err) {
    error =
      err instanceof Error ? err : new Error('Unable to load the dashboard.');
  }

  const calendarCells = Array.from(
    { length: calendarFirst.getDay() + calendarLast.getDate() },
    (_, index) =>
      index < calendarFirst.getDay()
        ? null
        : index - calendarFirst.getDay() + 1,
  );
  const calendarLockedDates = calendarLockedRaw;
  const jobsToClose = (eventJobs ?? []).filter((row) => {
    const state = row.state as {
      bookingType?: string;
      stages?: Array<{ key?: string; status?: string }>;
    } | null;
    const finalStage = state?.stages?.find(
      (stage) => stage.key === 'booking_final_check',
    );
    return (
      state?.bookingType === 'rental' &&
      (finalStage?.status === 'open' || finalStage?.status === 'in_progress')
    );
  }).length;
  const activeEventJobs = (eventJobs ?? []).filter((row) => {
    const state = row.state as { stages?: Array<{ status?: string }> } | null;
    return state?.stages?.some(
      (stage) => stage.status === 'open' || stage.status === 'in_progress',
    );
  }).length;
  const revenueRows = (paymentRows ?? []) as Array<{
    paid_amount: number | null;
    created_at: string | null;
  }>;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const paidRevenue = (from: Date) =>
    revenueRows.reduce((sum, row) => {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      return createdAt && createdAt >= from
        ? sum + Number(row.paid_amount ?? 0)
        : sum;
    }, 0);
  const revenueThisMonth = paidRevenue(monthStart);
  const revenueThisYear = paidRevenue(yearStart);
  const revenueTillNow = revenueRows.reduce(
    (sum, row) => sum + Number(row.paid_amount ?? 0),
    0,
  );
  const upcomingBookings = (upcomingRows ?? []) as unknown as Array<{
    id: number;
    booking_number: string;
    booking_type: string;
    status: string;
    event_name: string;
    event_date: string;
    event_time: string | null;
    event_location: string | null;
    customers: { name: string } | null;
  }>;
  const todayBookings = upcomingBookings.filter(
    (booking) => booking.event_date === today,
  );
  const trackedJobs = jobTrackerJobs.slice(0, 8);
  const recentBookings = (recent ?? []) as unknown as Array<{
    id: number;
    booking_number: string;
    booking_type: string;
    status: string;
    payment_status: string;
    event_name: string;
    event_date: string;
    total: number;
    customers: { name: string } | null;
  }>;
  const priorityItems = [
    todayBookings.length
      ? {
          label: "Today's events",
          detail: `${todayBookings[0].event_name}${todayBookings.length > 1 ? ` + ${todayBookings.length - 1} more` : ''}`,
          note: 'Event date is today',
          href: '/bookings/calendar',
          tone: 'text-rose-700 bg-rose-50',
        }
      : null,
    activeEventJobs
      ? {
          label: 'Client jobs in progress',
          detail: `${activeEventJobs} operational job${activeEventJobs === 1 ? '' : 's'} open`,
          note: 'Check warehouse, QC and collection',
          href: '/staff-portal/event-tracking',
          tone: 'text-emerald-700 bg-emerald-50',
        }
      : null,
    modificationCount
      ? {
          label: 'Modification request',
          detail: `${modificationCount} change${modificationCount === 1 ? '' : 's'} waiting`,
          note: 'Review before the event date',
          href: '/modifications',
          tone: 'text-amber-700 bg-amber-50',
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    detail: string;
    note: string;
    href: string;
    tone: string;
  }>;
  const pipeline = [
    { label: 'Quotations', value: quoteTotal ?? 0 },
    { label: 'Confirmed', value: confirmed ?? 0 },
    { label: 'In progress', value: activeEventJobs },
    { label: 'Completed', value: completed ?? 0 },
  ];
  const recentActivity = (eventJobs ?? [])
    .flatMap((row) => {
      const state = row.state as {
        activity?: Array<{
          id?: string;
          at?: string;
          action?: string;
          actor?: string;
          details?: string;
        }>;
      } | null;
      return state?.activity ?? [];
    })
    .filter((activity) => activity.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 5);
  const cards = [
    {
      label: 'All bookings',
      value: String(total ?? 0),
      note: 'Sales and rental bookings',
      icon: ClipboardList,
      href: '/bookings',
      tone: 'bg-[#f5ead8] dark:bg-[#33291c] text-[#8a5b24]',
    },
    {
      label: 'Pending client jobs',
      value: String(activeEventJobs),
      note: 'Warehouse, QC and collection flow',
      icon: ListChecks,
      href: '/staff-portal/event-tracking',
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Modifications pending',
      value: String(modificationCount ?? 0),
      note: 'Sale changes waiting for action',
      icon: PackageCheck,
      href: '/modifications',
      tone: 'bg-amber-50 text-amber-700',
    },
  ];
  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHeader
          title="Booking Dashboard"
          subtitle="Bookings, quotations and jobs waiting for closure"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/bookings/calendar" />}
              >
                <CalendarDays />
                <span className="hidden sm:inline">Open calendar</span>
              </Button>
              <Button size="sm" render={<Link href="/bookings/new" />}>
                <Plus />
                <span className="hidden sm:inline">Create booking</span>
              </Button>
            </div>
          }
        />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="h-full border-border shadow-level-1 ring-0">
            <CardHeader className="flex-row items-start justify-between pb-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Total Revenue
                </p>
                <p className="mt-2 text-sm font-semibold text-primary">
                  Live collections
                </p>
              </div>
              <CircleDollarSign className="size-5 text-emerald-600" />
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <div className="flex items-center justify-between border-b border-border/70 pb-2">
                <span className="text-muted-foreground">This Month</span>
                <span className="font-semibold">{money(revenueThisMonth)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/70 pb-2">
                <span className="text-muted-foreground">This Year</span>
                <span className="font-semibold">{money(revenueThisYear)}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold">Till Now</span>
                <span className="font-semibold text-emerald-600">
                  {money(revenueTillNow)}
                </span>
              </div>
              <Link
                href="/ledger"
                className="inline-flex pt-1 text-xs font-medium text-primary hover:underline"
              >
                View revenue <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </CardContent>
          </Card>
          {cards.map(({ label, value, note, href, icon: Icon, tone }) => (
            <Link key={label} href={href} className="group">
              <Card className="h-full border-border shadow-level-1 ring-0 transition group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-level-2">
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {label}
                    </p>
                    <CardTitle className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
                      {value}
                    </CardTitle>
                  </div>
                  <span
                    className={`grid size-11 place-items-center rounded-xl ${tone}`}
                  >
                    <Icon className="size-5" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{note}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
        <div className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <CalendarDays className="size-5 text-primary" /> Booking calendar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Live sales and rental bookings for this month.
            </p>
          </div>
          <Card className="border-border shadow-level-1 ring-0">
            <CardContent className="p-4">
              <CalendarDayGrid
                year={calendarYear}
                month={calendarMonth}
                cells={calendarCells}
                bookings={(calendarRows ?? []) as unknown as CalendarBooking[]}
                modificationBookings={[]}
                lockedDates={calendarLockedDates}
              />
            </CardContent>
          </Card>
        </div>
        {false && (
          <>
            <section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
              <Card className="border-border shadow-level-1 ring-0">
                <CardHeader className="flex-row items-center justify-between border-b py-4">
                  <div>
                    <CardTitle className="text-base">
                      Today&apos;s priorities
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Work that may need attention first.
                    </p>
                  </div>
                  <AlertTriangle className="size-5 text-primary" />
                </CardHeader>
                <CardContent className="p-3">
                  {priorityItems.length ? (
                    <div className="space-y-2">
                      {priorityItems.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="flex items-center gap-3 rounded-lg border border-border/80 p-3 transition hover:border-primary/35 hover:bg-accent/35"
                        >
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-full ${item.tone}`}
                          >
                            <AlertTriangle className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {item.label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {item.note}
                            </span>
                          </span>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="grid min-h-40 place-items-center p-5 text-center">
                      <div>
                        <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
                        <p className="mt-2 text-sm font-medium">
                          Nothing urgent today
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Your booking work is up to date.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="border-border shadow-level-1 ring-0">
                <CardHeader className="flex-row items-center justify-between border-b py-4">
                  <div>
                    <CardTitle className="text-base">Upcoming events</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next events from the booking calendar.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href="/bookings/calendar" />}
                  >
                    View calendar
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {upcomingBookings.length ? (
                    <div className="divide-y divide-border">
                      {upcomingBookings.slice(0, 6).map((booking) => (
                        <Link
                          key={booking.id}
                          href={`/bookings/${booking.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                            <CalendarDays className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {booking.event_name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {booking.customers?.name ?? 'Customer'} ·{' '}
                              {booking.event_location ?? 'Location not added'}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs font-medium text-primary">
                              {friendlyDate(booking.event_date)}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {statusLabel(booking.status)}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="grid min-h-40 place-items-center p-5 text-center text-sm text-muted-foreground">
                      No upcoming events.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border shadow-level-1 ring-0">
                <CardHeader className="border-b py-4">
                  <CardTitle className="text-base">Booking pipeline</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Live totals by the current workflow stage.
                  </p>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                  {pipeline.map((stage) => (
                    <div
                      key={stage.label}
                      className="rounded-lg bg-[#fcfaf7] dark:bg-[#241e17] p-3 text-center"
                    >
                      <p className="text-xl font-semibold tracking-[-0.03em]">
                        {stage.value}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {stage.label}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="border-border shadow-level-1 ring-0">
                <CardHeader className="border-b py-4">
                  <CardTitle className="text-base">Pending work</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Open items from the connected modules.
                  </p>
                </CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {[
                    [
                      'Client jobs in progress',
                      activeEventJobs,
                      '/staff-portal/event-tracking',
                    ],
                    [
                      'Modifications pending',
                      modificationCount ?? 0,
                      '/modifications',
                    ],
                    [
                      'Jobs to close',
                      jobsToClose,
                      '/staff-portal/booking/close-jobs',
                    ],
                  ].map(([label, value, href]) => (
                    <Link
                      key={String(label)}
                      href={String(href)}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                    >
                      <span className="flex-1 text-sm">{label}</span>
                      <Badge variant="outline">{String(value)}</Badge>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          </>
        )}
        {false && (
          <>
            <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
              <CardHeader className="flex-row items-center justify-between border-b py-5">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Route className="size-4 text-primary" /> Event tracker
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Live stage progress for every active event job.
                  </p>
                </div>
                <Button variant="outline" render={<Link href="/event-jobs" />}>
                  View all
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {trackedJobs.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="border-b bg-[#fcfaf7] dark:bg-[#241e17] text-xs text-muted-foreground">
                        <tr>
                          {[
                            'Job',
                            'Booking',
                            'Event',
                            'Current stage',
                            'Status',
                          ].map((h) => (
                            <th key={h} className="px-5 py-3 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trackedJobs.map((job) => (
                          <tr
                            key={job.id}
                            className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                          >
                            <td className="px-5 py-4">
                              <Link
                                href={`/event-jobs/${job.id}`}
                                className="font-semibold text-primary hover:underline"
                              >
                                {job.id}
                              </Link>
                            </td>
                            <td className="px-5 py-4 text-muted-foreground">
                              {job.bookingNumber}
                            </td>
                            <td className="px-5 py-4">
                              {job.eventSummary.eventName}
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarClock className="size-3.5" />
                                {friendlyDate(job.eventSummary.eventDate)}
                                {job.eventSummary.venue
                                  ? ` · ${job.eventSummary.venue}`
                                  : ''}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              {currentStageSummary(job)}
                            </td>
                            <td className="px-5 py-4">
                              <Badge
                                variant="outline"
                                className={
                                  job.status === 'closed'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                }
                              >
                                {job.status === 'closed' ? 'Closed' : 'Active'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid min-h-56 place-items-center p-8 text-center">
                    <div>
                      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                        <Route />
                      </span>
                      <h3 className="mt-4 font-semibold">
                        No active event jobs
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Confirm a booking to see its job tracker appear here
                        automatically.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        {false && (
          <>
            {false && (
              <>
                <Card className="border-border shadow-level-1 ring-0">
                  <CardHeader className="flex-row items-center justify-between border-b py-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarDays className="size-4 text-primary" />{' '}
                        Calendar
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Plan events and check availability from one view.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href="/bookings/calendar" />}
                    >
                      Open calendar
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold">Booking calendar</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Review upcoming sales and rental events by day or month.
                      </p>
                    </div>
                    <Link
                      href="/bookings/calendar"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View schedule{' '}
                      <ArrowRight className="ml-1 inline size-3.5" />
                    </Link>
                  </CardContent>
                </Card>
              </>
            )}
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b py-4">
                <CardTitle className="text-base">Quick access</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open the next part of the booking workflow.
                </p>
              </CardHeader>
              <CardContent className="grid gap-2 p-3 sm:grid-cols-3">
                {[
                  {
                    title: 'All bookings',
                    href: '/bookings',
                    icon: ClipboardList,
                  },
                  {
                    title: 'Quotes',
                    href: '/quotes',
                    icon: FileText,
                  },
                  {
                    title: 'Event tracking',
                    href: '/staff-portal/event-tracking',
                    icon: ListChecks,
                  },
                ].map(({ title, href, icon: Icon }) => (
                  <Link
                    key={title}
                    href={href}
                    className="group flex items-center gap-3 rounded-lg border border-border/80 px-3 py-3 transition hover:border-primary/35 hover:bg-accent/45"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                      <Icon className="size-4" />
                    </span>
                    <p className="flex-1 text-sm font-medium">{title}</p>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </>
        )}
        {false && (
          <>
            <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
              <CardHeader className="flex-row items-center justify-between border-b py-5">
                <div>
                  <CardTitle>Recent bookings</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Most recently created records
                  </p>
                </div>
                <Button variant="outline" render={<Link href="/bookings" />}>
                  View all
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {error ? (
                  <p className="p-6 text-sm text-destructive">
                    {error?.message}
                  </p>
                ) : recentBookings.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="border-b bg-[#fcfaf7] dark:bg-[#241e17] text-xs text-muted-foreground">
                        <tr>
                          {[
                            'Booking',
                            'Customer',
                            'Event',
                            'Status',
                            'Payment',
                            'Total',
                          ].map((h) => (
                            <th key={h} className="px-5 py-3 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recentBookings.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                          >
                            <td className="px-5 py-4">
                              <Link
                                href={`/bookings/${row.id}`}
                                className="font-semibold text-primary hover:underline"
                              >
                                {row.booking_number}
                              </Link>
                              <p className="text-xs capitalize text-muted-foreground">
                                {row.booking_type}
                              </p>
                            </td>
                            <td className="px-5 py-4 font-medium">
                              {row.customers?.name ?? '—'}
                            </td>
                            <td className="px-5 py-4">
                              {row.event_name}
                              <p className="text-xs text-muted-foreground">
                                {friendlyDate(row.event_date)}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <Badge
                                variant="outline"
                                className={statusTone(row.status)}
                              >
                                {statusLabel(row.status)}
                              </Badge>
                            </td>
                            <td className="px-5 py-4">
                              <Badge
                                variant="outline"
                                className={statusTone(row.payment_status)}
                              >
                                {statusLabel(row.payment_status)}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 font-semibold">
                              {money(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid min-h-64 place-items-center p-8 text-center">
                    <div>
                      <h3 className="font-semibold">
                        Your booking workspace is ready
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Create the first live booking to begin tracking
                        operations.
                      </p>
                      <Button
                        render={<Link href="/bookings/new" />}
                        className="mt-5"
                      >
                        <Plus />
                        Create booking
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b py-4">
                <CardTitle className="text-base">Recent activity</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Latest updates recorded by the event workflow.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {recentActivity.length ? (
                  <div className="divide-y divide-border">
                    {recentActivity.map((activity, index) => (
                      <div
                        key={activity.id ?? `${activity.at}-${index}`}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent text-primary">
                          <Clock3 className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {statusLabel(activity.action ?? 'updated')}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {activity.details ??
                              activity.actor ??
                              'Workflow update'}
                          </p>
                        </div>
                        <time className="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(String(activity.at)).toLocaleDateString(
                            'en-IN',
                            { day: '2-digit', month: 'short' },
                          )}
                        </time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-sm text-muted-foreground">
                    No workflow activity recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </BookingPortalShell>
  );
}
