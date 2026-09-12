import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Button } from '@/components/ui/button';
import {
  CalendarDayGrid,
  type CalendarBooking,
  type LockedDate,
} from '@/components/bookings/calendar-day-grid';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const LIVE_BOOKING_FILTER = `(b.is_quote = false or (b.is_quote = true and b.status not in ('draft','cancelled')))`;

const BOOKING_QUERY = `
  select
    b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.is_quote,
    b.event_name, b.event_date, b.event_time, b.event_location, b.pickup_date, b.due_date,
    b.subtotal, b.discount, b.tax, b.security_deposit, b.total, b.paid_amount, b.balance_amount, b.notes,
    case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers,
    coalesce(items.rows, '[]'::json) as booking_items
  from public.bookings b
  left join public.customers c on c.id = b.customer_id
  left join lateral (
    select json_agg(json_build_object(
      'item_name', bi.item_name,
      'quantity', bi.quantity,
      'unit_price', bi.unit_price,
      'line_total', bi.line_total,
      'product_id', bi.product_id,
      'products', case when p.id is null then null else json_build_object('image_urls', p.image_urls, 'barcode', p.barcode) end
    )) as rows
    from public.booking_items bi
    left join public.products p on p.id = bi.product_id
    where bi.booking_id = b.id
  ) items on true
  where ${LIVE_BOOKING_FILTER} and b.event_date >= $1 and b.event_date <= $2
  order by b.event_date
`;

// A "sale modification" request carries its own dispatch date inside the
// booking's notes (independent of the event date), so it's fetched
// separately — same source the Modifications queue already uses.
const MODIFICATION_BOOKING_QUERY = `
  select
    b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.is_quote,
    b.event_name, b.event_date, b.event_time, b.event_location, b.pickup_date, b.due_date,
    b.subtotal, b.discount, b.tax, b.security_deposit, b.total, b.paid_amount, b.balance_amount, b.notes,
    case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers,
    coalesce(items.rows, '[]'::json) as booking_items
  from public.bookings b
  left join public.customers c on c.id = b.customer_id
  left join lateral (
    select json_agg(json_build_object(
      'item_name', bi.item_name,
      'quantity', bi.quantity,
      'unit_price', bi.unit_price,
      'line_total', bi.line_total,
      'product_id', bi.product_id,
      'products', case when p.id is null then null else json_build_object('image_urls', p.image_urls, 'barcode', p.barcode) end
    )) as rows
    from public.booking_items bi
    left join public.products p on p.id = bi.product_id
    where bi.booking_id = b.id
  ) items on true
  where b.booking_type = 'sale' and ${LIVE_BOOKING_FILTER} and b.notes ilike $1
`;

export default async function BookingCalendar({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const requested = (await searchParams).month;
  const base =
    requested && /^\d{4}-\d{2}$/.test(requested)
      ? new Date(`${requested}-01T00:00:00`)
      : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month + 1)}-01`;
  const end = `${year}-${pad(month + 1)}-${pad(last.getDate())}`;

  const { bookings, modificationBookings, lockedDates, error } = await withUserContext(
    user.id,
    async (tx) => {
      try {
        const [bookingRows, modificationRows] = (await Promise.all([
          tx.unsafe(BOOKING_QUERY, [start, end]),
          tx.unsafe(MODIFICATION_BOOKING_QUERY, ['%SALE MODIFICATION REQUIRED%']),
        ])) as unknown as [CalendarBooking[], CalendarBooking[]];

        // Dates locked from the Leads Center (see app/leads/actions.ts) block a
        // date from being double-booked. If the leads_center migration hasn't
        // been applied yet the table won't exist — the calendar just renders
        // with no locked dates rather than failing.
        let lockedDatesRows: LockedDate[] = [];
        try {
          lockedDatesRows = (await tx.unsafe(
            `select id, locked_date, label, notes from public.lead_locked_dates where locked_date >= $1 and locked_date <= $2`,
            [start, end],
          )) as unknown as LockedDate[];
        } catch {
          lockedDatesRows = [];
        }

        return {
          bookings: bookingRows,
          modificationBookings: modificationRows,
          lockedDates: lockedDatesRows,
          error: null as Error | null,
        };
      } catch (queryError) {
        return {
          bookings: [] as CalendarBooking[],
          modificationBookings: [] as CalendarBooking[],
          lockedDates: [] as LockedDate[],
          error: queryError instanceof Error ? queryError : new Error('Failed to load the calendar.'),
        };
      }
    },
  );

  const cells = Array.from(
    { length: first.getDay() + last.getDate() },
    (_, i) => (i < first.getDay() ? null : i - first.getDay() + 1),
  );
  const move = (amount: number) => {
    const d = new Date(year, month + amount, 1);
    return `/bookings/calendar?month=${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHeader
          title="Event calendar"
          subtitle={base.toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
          })}
          backHref="/bookings"
          actions={
            <>
              <Button
                variant="outline"
                size="icon-sm"
                render={<Link href={move(-1)} aria-label="Previous month" />}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                render={<Link href={move(1)} aria-label="Next month" />}
              >
                <ChevronRight />
              </Button>
            </>
          }
        />
        {error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : (
          <CalendarDayGrid
            year={year}
            month={month}
            cells={cells}
            bookings={bookings}
            modificationBookings={modificationBookings}
            lockedDates={lockedDates}
          />
        )}
      </div>
    </BookingPortalShell>
  );
}
