import Link from 'next/link';
import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
} from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import {
  BookingPdfButton,
  type PdfBooking,
} from '@/components/bookings/booking-pdf-button';
import { BookingsListToolbar } from '@/components/bookings/bookings-list-toolbar';
import { ListFilterForm } from '@/components/bookings/list-filter-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  BookingRow,
  bookingDateHeading,
  friendlyDate,
  money,
  statusLabel,
  statusTone,
} from '@/lib/bookings';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext, type DbParameter } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';
const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const requestedPageSize = Number(params.perPage ?? DEFAULT_PAGE_SIZE);
  const pageSize = PAGE_SIZES.includes(
    requestedPageSize as (typeof PAGE_SIZES)[number],
  )
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;
  const search = typeof params.q === 'string' ? params.q.trim() : '';
  const type = params.type === 'rental' ? 'rental' : 'sale';
  const status = typeof params.status === 'string' ? params.status : '';
  const payment = typeof params.payment === 'string' ? params.payment : '';
  const created = typeof params.created === 'string' ? params.created : '';
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();
  const readOnly = staffSession?.portalKind === 'accounts';

  const from = (page - 1) * pageSize;

  const { bookings, count, error } = await withUserContext(user.id, async (tx) => {
    let customerIds: number[] = [];
    if (search) {
      const rows = (await tx.unsafe(
        `select id from public.customers where (name ilike $1 or phone ilike $1) limit 50`,
        [`%${search}%`],
      )) as unknown as { id: number }[];
      customerIds = rows.map((row) => row.id);
    }

    // Quotes stay exclusively in the Quotes module, even after conversion.
    const conditions: string[] = ['b.is_quote = false', 'b.booking_type = $1'];
    const params: DbParameter[] = [type];
    if (search) {
      const searchConditions: string[] = [];
      params.push(`%${search}%`);
      const searchIndex = params.length;
      searchConditions.push(`b.booking_number ilike $${searchIndex}`);
      searchConditions.push(`b.event_name ilike $${searchIndex}`);
      searchConditions.push(`b.event_location ilike $${searchIndex}`);
      if (customerIds.length) {
        params.push(customerIds);
        searchConditions.push(`b.customer_id = any($${params.length}::bigint[])`);
      }
      conditions.push(`(${searchConditions.join(' or ')})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (payment) {
      params.push(payment);
      conditions.push(`b.payment_status = $${params.length}`);
    }
    const whereClause = conditions.join(' and ');

    const countQuery = `select count(*)::int as count from public.bookings b where ${whereClause}`;

    const listParams = [...params, pageSize, from];
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    const listQuery = `
      select
        b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.is_quote,
        b.event_name, b.event_date::text as event_date, b.event_time::text as event_time,
        b.event_location, b.pickup_date::text as pickup_date, b.due_date::text as due_date,
        b.subtotal, b.discount, b.tax, b.total, b.paid_amount, b.balance_amount, b.security_deposit,
        b.created_at::text as created_at,
        case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone, 'address', c.address) end as customers,
        case when s.id is null then null else json_build_object('name', s.name) end as staff_members,
        coalesce(items.rows, '[]'::json) as booking_items
      from public.bookings b
      left join public.customers c on c.id = b.customer_id
      left join public.staff_members s on s.id = b.assigned_staff_id
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
      where ${whereClause}
      order by b.created_at desc, b.id desc
      limit $${limitIndex} offset $${offsetIndex}
    `;

    try {
      const [countRows, listRows] = (await Promise.all([
        tx.unsafe(countQuery, params),
        tx.unsafe(listQuery, listParams),
      ])) as unknown as [{ count: number }[], (BookingRow & PdfBooking)[]];
      return { bookings: listRows, count: countRows[0]?.count ?? 0, error: null };
    } catch (queryError) {
      return {
        bookings: [] as (BookingRow & PdfBooking)[],
        count: 0,
        error: queryError instanceof Error ? queryError : new Error('Failed to load bookings.'),
      };
    }
  });

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const queryString = (nextPage: number) => {
    const copy = new URLSearchParams();
    if (search) copy.set('q', search);
    copy.set('type', type);
    if (status) copy.set('status', status);
    if (payment) copy.set('payment', payment);
    copy.set('perPage', String(pageSize));
    copy.set('page', String(nextPage));
    return `/bookings?${copy}`;
  };

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHeader
          title="All bookings"
          subtitle="Sales, rentals, payments and events"
          backHref="/dashboard"
          actions={!readOnly ? (
            <Button size="sm" render={<Link href="/bookings/new" />}>
              <Plus />
              <span className="hidden sm:inline">Create booking</span>
            </Button>
          ) : null}
        />

        {created ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <AlertTitle>Booking created successfully</AlertTitle>
            <AlertDescription>
              {created} is saved. Use Preview to open its complete record.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
          <BookingsListToolbar
            mode={type}
            count={count ?? 0}
            from={(count ?? 0) === 0 ? 0 : from + 1}
            to={Math.min(from + bookings.length, count ?? 0)}
            pageSize={pageSize}
          />
          <ListFilterForm
            search={search}
            searchPlaceholder="Search ID, customer, event or location"
            mobileSearchOnly
            filters={[
              {
                name: 'status',
                label: 'All statuses',
                value: status,
                options: [
                  ['confirmed', 'Confirmed'],
                  ['ready', 'Ready'],
                  ['out_for_delivery', 'Out for delivery'],
                  ['active', 'Active'],
                  ['completed', 'Completed'],
                  ['cancelled', 'Cancelled'],
                ],
              },
              {
                name: 'payment',
                label: 'All payments',
                value: payment,
                options: [
                  ['unpaid', 'Unpaid'],
                  ['partial', 'Partial'],
                  ['paid', 'Paid'],
                  ['refunded', 'Refunded'],
                ],
              },
            ]}
          />
          <CardContent className="p-0">
            {error ? (
              <State
                title="Bookings could not be loaded"
                description={error.message}
              />
            ) : bookings.length === 0 ? (
              <State
                title="No bookings found"
                description={`No ${type} bookings match the current filters.`}
                action={!readOnly}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="border-b bg-white dark:bg-card text-xs text-muted-foreground">
                    <tr>
                      {[
                        'Booking',
                        'Customer',
                        'Event',
                        'Status',
                        'Payment',
                        'Actions',
                      ].map((h) => (
                        <th key={h} className="px-5 py-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking, index) => (
                      <Fragment key={booking.id}>
                      {booking.created_at.slice(0, 10) !== bookings[index - 1]?.created_at.slice(0, 10) ? (
                        <tr className="bg-[#f8f2e9] dark:bg-[#241e17]">
                          <th colSpan={6} scope="colgroup" className="px-5 py-2.5 text-left text-sm font-semibold text-[#70481c] dark:text-[#e6c99d]">
                            {bookingDateHeading(booking.created_at)}
                          </th>
                        </tr>
                      ) : null}
                      <tr
                        className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/bookings/${booking.id}?returnTo=${encodeURIComponent(`/bookings?type=${type}`)}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {booking.booking_number}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="capitalize">
                              {booking.booking_type}
                            </span>
                          </p>
                        </td>
                        <td className="px-5 py-4 font-medium">
                          {booking.customers?.name ?? '—'}
                          <p className="mt-1 text-xs font-normal text-muted-foreground">
                            {booking.customers?.phone}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {booking.event_name}
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3" />
                            {friendlyDate(booking.event_date)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant="outline"
                            className={statusTone(booking.status)}
                          >
                            {statusLabel(booking.status)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant="outline"
                            className={statusTone(booking.payment_status)}
                          >
                            {statusLabel(booking.payment_status)}
                          </Badge>
                          <p className="mt-1 text-xs font-medium text-foreground">
                            Total {money(booking.total)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Balance {money(booking.balance_amount)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              render={
                                <Link
                                  href={`/bookings/${booking.id}?returnTo=${encodeURIComponent(`/bookings?type=${type}`)}`}
                                  aria-label={`Preview ${booking.booking_number}`}
                                />
                              }
                              title="Preview booking"
                            >
                              <Eye />
                              <span>Open</span>
                            </Button>
                            {!readOnly ? <Button
                              variant="outline"
                              size="sm"
                              render={
                                <Link
                                  href={`/bookings/${booking.id}/edit?returnTo=${encodeURIComponent(`/bookings?type=${type}`)}`}
                                  aria-label={`Edit ${booking.booking_number}`}
                                />
                              }
                              title="Edit booking"
                            >
                              <Pencil />
                              <span>Edit</span>
                            </Button> : null}
                            <BookingPdfButton booking={booking} />
                          </div>
                        </td>
                      </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <div className="flex flex-col items-center justify-center gap-3 border-t px-4 py-4 text-sm lg:flex-row lg:justify-between lg:px-5">
            <p className="text-muted-foreground">
              {count ?? 0} booking{count === 1 ? '' : 's'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                render={
                  page > 1 ? (
                    <Link
                      href={queryString(page - 1)}
                      aria-label="Previous page"
                    />
                  ) : undefined
                }
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-20 text-center text-xs text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pageCount}
                render={
                  page < pageCount ? (
                    <Link href={queryString(page + 1)} aria-label="Next page" />
                  ) : undefined
                }
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </BookingPortalShell>
  );
}

function State({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: boolean;
}) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
          <ClipboardList className="size-5" />
        </div>
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button render={<Link href="/bookings/new" />} className="mt-5">
            <Plus />
            Create booking
          </Button>
        )}
      </div>
    </div>
  );
}
