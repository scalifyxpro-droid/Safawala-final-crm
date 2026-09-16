import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Pencil,
  Plus,
  XCircle,
} from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import {
  BookingPdfButton,
  type PdfBooking,
} from '@/components/bookings/booking-pdf-button';
import { QuoteActions } from '@/components/bookings/quote-actions';
import { ExportQuotesButton } from '@/components/bookings/quote-export-button';
import { RefreshQuotesButton } from '@/components/bookings/refresh-quotes-button';
import { BookingsListToolbar } from '@/components/bookings/bookings-list-toolbar';
import { ListFilterForm } from '@/components/bookings/list-filter-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  BookingRow,
  displayQuoteNumber,
  friendlyDate,
  money,
  quoteState,
  quoteStateTone,
  QUOTE_STATE_LABEL,
  type QuoteState,
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

type QuoteListRow = BookingRow & PdfBooking;
type QuoteSummaryRow = { id: number; status: string; created_at: string; booking_number: string };

export default async function QuotesPage({ searchParams }: Props) {
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
  const state = typeof params.state === 'string' ? params.state : '';
  const time = typeof params.time === 'string' ? params.time : '';
  const createdRaw = typeof params.created === 'string' ? params.created : '';
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();
  const quoteOnly = staffSession?.accessType === 'staff';

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const timeFrom =
    time === 'today'
      ? todayStart
      : time === 'week'
        ? weekStart
        : time === 'month'
          ? monthStart
          : null;

  const from = (page - 1) * pageSize;

  let data: QuoteListRow[] = [];
  let count = 0;
  let quoteSummary: QuoteSummaryRow[] = [];
  let error: Error | null = null;

  try {
    const result = await withUserContext(user.id, async (tx) => {
      let customerIds: number[] = [];
      if (search) {
        const rows = (await tx.unsafe(
          `select id from public.customers where (name ilike $1 or phone ilike $1) limit 50`,
          [`%${search}%`],
        )) as unknown as { id: number }[];
        customerIds = rows.map((row) => row.id);
      }

      const conditions: string[] = ['b.is_quote = true', 'b.booking_type = $1'];
      const listParams: DbParameter[] = [type];
      if (quoteOnly && staffSession) {
        listParams.push(staffSession.staffMemberId);
        conditions.push(`b.created_by_staff_id = $${listParams.length}`);
      }
      if (search) {
        listParams.push(`%${search}%`);
        const searchIdx = listParams.length;
        let clause = `(b.booking_number ilike $${searchIdx} or b.event_name ilike $${searchIdx} or b.event_location ilike $${searchIdx}`;
        if (customerIds.length) {
          listParams.push(customerIds);
          clause += ` or b.customer_id = any($${listParams.length}::bigint[])`;
        }
        clause += ')';
        conditions.push(clause);
      }
      if (state === 'generated') {
        listParams.push('draft');
        conditions.push(`b.status = $${listParams.length}`);
      } else if (state === 'rejected') {
        listParams.push('cancelled');
        conditions.push(`b.status = $${listParams.length}`);
      } else if (state === 'converted') {
        conditions.push(`b.status not in ('draft','cancelled')`);
      }
      if (timeFrom) {
        listParams.push(timeFrom.toISOString());
        conditions.push(`b.created_at >= $${listParams.length}`);
      }
      const whereClause = conditions.join(' and ');

      const countQuery = `select count(*)::int as count from public.bookings b where ${whereClause}`;

      const listQuery = `
        select
          b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.is_quote,
          b.converted_booking_id, b.created_by_staff_id, b.event_name,
          b.event_date::text as event_date, b.event_time::text as event_time,
          b.event_location, b.pickup_date::text as pickup_date, b.due_date::text as due_date,
          b.subtotal, b.discount, b.tax, b.total, b.paid_amount, b.balance_amount,
          b.security_deposit, b.created_at::text as created_at,
          case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone, 'address', c.address) end as customers,
          case when s.id is null then null else json_build_object('name', s.name) end as staff_members,
          coalesce(items.rows, '[]'::json) as booking_items
        from public.bookings b
        left join public.customers c on c.id = b.customer_id
        left join public.staff_members s on s.id = b.assigned_staff_id
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
        where ${whereClause}
        order by b.created_at desc, b.id desc
        limit $${listParams.length + 1} offset $${listParams.length + 2}
      `;

      const summaryConditions: string[] = ['is_quote = true', 'booking_type = $1'];
      const summaryParams: DbParameter[] = [type];
      if (quoteOnly && staffSession) {
        summaryParams.push(staffSession.staffMemberId);
        summaryConditions.push(`created_by_staff_id = $${summaryParams.length}`);
      }
      const summaryQuery = `
        select id, status, created_at, booking_number from public.bookings
        where ${summaryConditions.join(' and ')}
        order by created_at desc, id desc
        limit 10000
      `;

      const [countRows, listRows, summaryRows] = (await Promise.all([
        tx.unsafe(countQuery, listParams),
        tx.unsafe(listQuery, [...listParams, pageSize, from]),
        tx.unsafe(summaryQuery, summaryParams),
      ])) as unknown as [{ count: number }[], QuoteListRow[], QuoteSummaryRow[]];

      return {
        count: countRows[0]?.count ?? 0,
        data: listRows,
        quoteSummary: summaryRows,
      };
    });
    count = result.count;
    data = result.data;
    quoteSummary = result.quoteSummary;
  } catch (err) {
    error = err instanceof Error ? err : new Error('Unable to load quotes.');
  }

  const sequenceById = new Map<number, number>();
  const yearlyCounts = new Map<string, number>();
  quoteSummary.forEach((quote) => {
    const year = String(new Date(quote.created_at).getFullYear());
    const next = (yearlyCounts.get(year) ?? 0) + 1;
    yearlyCounts.set(year, next);
    sequenceById.set(quote.id, next);
  });
  const totalCount = quoteSummary.length;
  const generatedCount = quoteSummary.filter(
    (quote) => quote.status === 'draft',
  ).length;
  const rejectedCount = quoteSummary.filter(
    (quote) => quote.status === 'cancelled',
  ).length;
  const convertedCount = quoteSummary.filter(
    (quote) => !['draft', 'cancelled'].includes(quote.status),
  ).length;
  const rawQuotes = (data ?? []) as unknown as (BookingRow & PdfBooking)[];
  const quotes = rawQuotes.map((quote) => ({
    ...quote,
    booking_number: displayQuoteNumber(
      quote.booking_number,
      quote.booking_type,
      sequenceById.get(quote.id),
    ),
  }));
  const createdQuote = quoteSummary.find(
    (quote) => quote.booking_number === createdRaw,
  );
  const created = createdRaw
    ? displayQuoteNumber(
        createdRaw,
        type,
        createdQuote ? sequenceById.get(createdQuote.id) : undefined,
      )
    : '';
  const loadError = error;
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const queryString = (nextPage: number) => {
    const copy = new URLSearchParams();
    if (search) copy.set('q', search);
    copy.set('type', type);
    if (state) copy.set('state', state);
    if (time) copy.set('time', time);
    copy.set('perPage', String(pageSize));
    copy.set('page', String(nextPage));
    return `/quotes?${copy}`;
  };

  const cards: {
    label: string;
    value: string;
    note: string;
    icon: typeof FileText;
    tone: 'default' | 'success' | 'warning' | 'danger';
  }[] = [
    {
      label: 'Total quotes',
      value: String(totalCount ?? 0),
      note: 'All saved quotes',
      icon: FileText,
      tone: 'default',
    },
    {
      label: 'Generated',
      value: String(generatedCount ?? 0),
      note: 'Awaiting a decision',
      icon: Clock,
      tone: 'warning',
    },
    {
      label: 'Converted',
      value: String(convertedCount ?? 0),
      note: 'Accepted into live bookings',
      icon: CheckCircle2,
      tone: 'success',
    },
    {
      label: 'Rejected',
      value: String(rejectedCount ?? 0),
      note: 'Declined quotes',
      icon: XCircle,
      tone: 'danger',
    },
  ];

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHeader
          title="Quote Management"
          subtitle="Generate and manage customer quotes"
          backHref="/bookings"
          actions={
            <>
              <RefreshQuotesButton />
              {!quoteOnly ? <ExportQuotesButton quotes={quotes} /> : null}
              <Button size="sm" render={<Link href={`/bookings/new?type=${type}`} />}>
                <Plus />
                <span className="hidden md:inline">New Quote</span>
              </Button>
            </>
          }
        />

        {created ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <AlertTitle>Quote saved successfully</AlertTitle>
            <AlertDescription>
              {created} is saved as a quote. Accept it once the customer
              confirms to turn it into a live booking.
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
          {cards.map(({ label, value, note, icon: Icon, tone }) => {
            const colors =
              tone === 'success'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : tone === 'warning'
                  ? 'bg-amber-50 text-amber-700 ring-amber-200'
                  : tone === 'danger'
                    ? 'bg-red-50 text-red-700 ring-red-200'
                    : 'bg-accent text-primary ring-[#e4d2b6]';

            return (
              <Link
                key={label}
                href={`/quotes?type=${type}${label === 'Total quotes' ? '' : `&state=${label.toLowerCase()}`}`}
                className="group min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Show ${label.toLowerCase()}`}
              >
              <Card
                className={`h-full min-w-0 gap-0 py-0 shadow-level-1 transition group-hover:border-primary/40 group-hover:shadow-level-2 ${state === (label === 'Total quotes' ? '' : label.toLowerCase()) ? 'border-primary/50 ring-2 ring-primary/10' : 'border-border ring-0'}`}
              >
                <CardContent className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-5">
                  <div className="min-w-0">
                    <p className="break-words text-[10px] font-semibold uppercase leading-tight tracking-[0.09em] text-muted-foreground sm:text-[11px] sm:tracking-[0.12em]">
                      {label}
                    </p>
                    <p className="mt-1 break-words text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                      {value}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground sm:truncate sm:text-xs">
                      {note}
                    </p>
                  </div>
                  <span
                    className={`order-first grid size-8 shrink-0 place-items-center rounded-xl ring-1 sm:order-last sm:size-10 [&_svg]:size-4 ${colors}`}
                  >
                    <Icon />
                  </span>
                </CardContent>
              </Card>
              </Link>
            );
          })}
        </section>

        <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
          <BookingsListToolbar
            mode={type}
            count={count ?? 0}
            from={(count ?? 0) === 0 ? 0 : from + 1}
            to={Math.min(from + quotes.length, count ?? 0)}
            pageSize={pageSize}
            itemLabel="quotes"
          />
          <ListFilterForm
            search={search}
            searchPlaceholder="Search quote, customer or event"
            mobileSearchOnly
            filters={[
              {
                name: 'state',
                label: 'All statuses',
                value: state,
                options: [
                  ['generated', 'Generated'],
                  ['converted', 'Converted'],
                  ['rejected', 'Rejected'],
                ],
              },
              {
                name: 'time',
                label: 'All time',
                value: time,
                options: [
                  ['today', 'Today'],
                  ['week', 'This week'],
                  ['month', 'This month'],
                ],
              },
            ]}
          />
          <CardContent className="p-0">
            {loadError ? (
              <State
                title="Quotes could not be loaded"
                description={loadError.message}
              />
            ) : quotes.length === 0 ? (
              <State
                title="No quotes found"
                description={`No ${type} quotes match the current filters.`}
                action
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="border-b bg-white dark:bg-card text-xs text-muted-foreground">
                    <tr>
                      {[
                        'Quote #',
                        'Customer',
                        'Type',
                        'Event',
                        'Amount',
                        'Status',
                        'Created',
                        'Actions',
                      ].map((h) => (
                        <th key={h} className="px-5 py-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((quote) => {
                      const currentState: QuoteState = quoteState(quote.status);
                      return (
                        <tr
                          key={quote.id}
                          className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                        >
                          <td className="px-5 py-4">
                            <Link
                              href={`/bookings/${quote.id}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {quote.booking_number}
                            </Link>
                          </td>
                          <td className="px-5 py-4 font-medium">
                            {quote.customers?.name ?? '—'}
                            <p className="mt-1 text-xs font-normal text-muted-foreground">
                              {quote.customers?.phone}
                            </p>
                          </td>
                          <td className="px-5 py-4 capitalize">
                            {quote.booking_type}
                          </td>
                          <td className="px-5 py-4">
                            {quote.event_name}
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="size-3" />
                              {friendlyDate(quote.event_date)}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-semibold">
                            {money(quote.total)}
                          </td>
                          <td className="px-5 py-4">
                            <Badge
                              variant="outline"
                              className={quoteStateTone(currentState)}
                            >
                              {QUOTE_STATE_LABEL[currentState]}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            {friendlyDate(quote.created_at)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                render={
                                  <Link
                                    href={`/bookings/${quote.id}`}
                                    aria-label={`Preview ${quote.booking_number}`}
                                  />
                                }
                                title="Preview quote"
                              >
                                <Eye />
                              </Button>
                              {!quoteOnly ? <Button
                                variant="ghost"
                                size="icon-sm"
                                render={
                                  <Link
                                    href={`/bookings/${quote.id}/edit`}
                                    aria-label={`Edit ${quote.booking_number}`}
                                  />
                                }
                                title="Edit quote"
                              >
                                <Pencil />
                              </Button> : null}
                              {!quoteOnly ? <BookingPdfButton booking={quote} /> : null}
                              {!quoteOnly ? <QuoteActions
                                bookingId={quote.id}
                                state={currentState}
                                convertedBookingId={quote.converted_booking_id}
                              /> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <div className="flex items-center justify-between border-t px-5 py-4 text-sm">
            <p className="text-muted-foreground">
              {count ?? 0} quote{count === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
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
          <FileText className="size-5" />
        </div>
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button render={<Link href="/bookings/new" />} className="mt-5">
            <Plus />
            New Quote
          </Button>
        )}
      </div>
    </div>
  );
}
