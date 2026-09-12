import { notFound, redirect } from 'next/navigation';
import { MapPin, Phone } from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { BookingActions } from '@/components/bookings/booking-actions';
import { BookingPdfButton, type PdfBooking } from '@/components/bookings/booking-pdf-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BOOKING_TERMS,
  displayQuoteNumber,
  friendlyDate,
  friendlyDateTime,
  friendlyTime,
  money,
  statusLabel,
  statusTone,
} from '@/lib/bookings';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';

const BOOKING_DETAIL_QUERY = `
  select
    b.*,
    case when c.id is null then null else to_jsonb(c.*) end as customers,
    case when s.id is null then null else json_build_object('name', s.name) end as staff_members,
    coalesce(items.rows, '[]'::json) as booking_items,
    coalesce(payments.rows, '[]'::json) as booking_payments,
    coalesce(activity.rows, '[]'::json) as booking_activity
  from public.bookings b
  left join public.customers c on c.id = b.customer_id
  left join public.staff_members s on s.id = b.assigned_staff_id
  left join lateral (
    select json_agg(
      to_jsonb(bi.*) || jsonb_build_object(
        'products',
        case when p.id is null then null else json_build_object('image_urls', p.image_urls, 'barcode', p.barcode) end
      )
    ) as rows
    from public.booking_items bi
    left join public.products p on p.id = bi.product_id
    where bi.booking_id = b.id
  ) items on true
  left join lateral (
    select json_agg(to_jsonb(bp.*)) as rows
    from public.booking_payments bp
    where bp.booking_id = b.id
  ) payments on true
  left join lateral (
    select json_agg(to_jsonb(ba.*)) as rows
    from public.booking_activity ba
    where ba.booking_id = b.id
  ) activity on true
  where b.id = $1
  limit 1
`;

export default async function BookingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();
  const quoteOnly = staffSession?.accessType === 'staff';

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const booking = await withUserContext(user.id, async (tx) => {
    const rows = (await tx.unsafe(BOOKING_DETAIL_QUERY, [numericId])) as unknown as Array<
      Record<string, unknown> & {
        id: number;
        booking_number: string;
        booking_type: string;
        status: string;
        payment_status: string;
        is_quote: boolean;
        created_at: string;
        subtotal: number;
        discount: number;
        tax: number;
        total: number;
        paid_amount: number;
        balance_amount: number;
        security_deposit: number;
        event_name: string;
        event_date: string;
        event_time: string | null;
        event_location: string | null;
        pickup_date: string | null;
        due_date: string | null;
        contact_name: string | null;
        alternate_mobile: string | null;
        customers: { name: string; phone: string } | null;
        staff_members: { name: string } | null;
        booking_items: {
          id: number;
          item_name: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          product_id: number | null;
          products?: { image_urls: string[] | null; barcode: string | null } | null;
        }[];
        booking_payments: {
          id: number;
          payment_method: string;
          paid_at: string;
          reference_number: string | null;
          amount: number;
        }[];
        booking_activity: { id: number; action: string; created_at: string }[];
      }
    >;
    return rows[0] ?? null;
  });
  if (!booking) notFound();

  const activities = [...(booking.booking_activity ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const requestedReturnTo = typeof query.returnTo === 'string' ? query.returnTo : '';
  const returnTo = requestedReturnTo.startsWith('/bookings') || requestedReturnTo.startsWith('/quotes')
    ? requestedReturnTo
    : booking.is_quote ? '/quotes' : `/bookings?type=${booking.booking_type}`;
  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <DashboardHeader
          title={
            booking.is_quote
              ? displayQuoteNumber(
                  booking.booking_number,
                  booking.booking_type as 'sale' | 'rental',
                )
              : booking.booking_number
          }
          subtitle={`${statusLabel(booking.booking_type)} booking · created ${friendlyDate(booking.created_at.slice(0, 10))}`}
          backHref={returnTo}
          actions={
            <>
              <Badge
                variant="outline"
                className={`hidden md:inline-flex ${statusTone(booking.status)}`}
              >
                {statusLabel(booking.status)}
              </Badge>
              <Badge
                variant="outline"
                className={`hidden lg:inline-flex ${statusTone(booking.payment_status)}`}
              >
                {statusLabel(booking.payment_status)}
              </Badge>
              {!quoteOnly ? <BookingPdfButton booking={booking as unknown as PdfBooking} label="Print booking" /> : null}
            </>
          }
        />
        {!quoteOnly ? <BookingActions
          booking={{
            id: booking.id,
            booking_type: booking.booking_type,
            status: booking.status,
            total: Number(booking.total),
            paid_amount: Number(booking.paid_amount),
            security_deposit: Number(booking.security_deposit),
          }}
        /> : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.7fr)]">
          <div className="space-y-6">
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b">
                <CardTitle>Event & customer</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Info label="Customer" value={booking.customers?.name} />
                <Info
                  label="Phone"
                  value={booking.customers?.phone}
                  icon={<Phone />}
                />
                <Info label="Event" value={booking.event_name} />
                <Info
                  label="Event date"
                  value={`${friendlyDate(booking.event_date)}${booking.event_time ? ` · ${friendlyTime(booking.event_time)}` : ''}`}
                />
                <Info
                  label="Location"
                  value={booking.event_location || 'Not added'}
                  icon={<MapPin />}
                />
                <Info
                  label="Assigned staff"
                  value={booking.staff_members?.name || 'Unassigned'}
                />
                {booking.booking_type === 'rental' && (
                  <>
                    <Info
                      label="Contact name"
                      value={booking.contact_name || 'Not added'}
                    />
                    <Info
                      label="Alternate mobile"
                      value={booking.alternate_mobile || 'Not added'}
                      icon={<Phone />}
                    />
                    <Info
                      label="Pickup date"
                      value={friendlyDate(booking.pickup_date)}
                    />
                    <Info
                      label="Due date"
                      value={friendlyDate(booking.due_date)}
                    />
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b">
                <CardTitle>Booking items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="border-b bg-[#fcfaf7] dark:bg-[#241e17] text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">Item</th>
                        <th className="px-5 py-3 font-medium">Qty</th>
                        <th className="px-5 py-3 font-medium">Price</th>
                        <th className="px-5 py-3 text-right font-medium">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {booking.booking_items.map(
                        (item: {
                          id: number;
                          item_name: string;
                          quantity: number;
                          unit_price: number;
                          line_total: number;
                        }) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="px-5 py-4 font-medium">
                              {item.item_name}
                            </td>
                            <td className="px-5 py-4">{item.quantity}</td>
                            <td className="px-5 py-4">
                              {money(item.unit_price)}
                            </td>
                            <td className="px-5 py-4 text-right font-semibold">
                              {money(item.line_total)}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b">
                <CardTitle>{quoteOnly ? 'Payments · Main ID only' : 'Payments'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {booking.booking_payments.length ? (
                  booking.booking_payments.map(
                    (payment: {
                      id: number;
                      payment_method: string;
                      paid_at: string;
                      reference_number: string | null;
                      amount: number;
                    }) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium capitalize">
                            {payment.payment_method.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {friendlyDateTime(payment.paid_at)}
                            {payment.reference_number
                              ? ` · ${payment.reference_number}`
                              : ''}
                          </p>
                        </div>
                        <strong>{money(payment.amount)}</strong>
                      </div>
                    ),
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b">
                <CardTitle>Terms & conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-5 text-muted-foreground">
                  {BOOKING_TERMS.map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
          <aside className="space-y-6">
            <Card className="border-[#dfc9a6] shadow-level-1 ring-0">
              <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17]">
                <CardTitle>Financial summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Amount label="Subtotal" value={booking.subtotal} />
                <Amount label="Discount" value={-booking.discount} />
                <Amount label="Tax / charges" value={booking.tax} />
                {booking.booking_type === 'rental' && (
                  <Amount
                    label="Security deposit"
                    value={booking.security_deposit}
                  />
                )}
                <div className="border-t pt-3">
                  <Amount label="Total" value={booking.total} strong />
                </div>
                <Amount label="Paid" value={booking.paid_amount} />
                <div className="rounded-lg bg-accent p-3">
                  <Amount
                    label="Balance due"
                    value={booking.balance_amount}
                    strong
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border shadow-level-1 ring-0">
              <CardHeader className="border-b">
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="relative pl-5 before:absolute before:left-0 before:top-1 before:size-2 before:rounded-full before:bg-primary"
                  >
                    <p className="text-sm font-medium">
                      {statusLabel(activity.action)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {friendlyDateTime(activity.created_at)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </BookingPortalShell>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 flex items-center gap-2 font-medium">
        {icon && <span className="text-primary [&_svg]:size-4">{icon}</span>}
        {value}
      </p>
    </div>
  );
}
function Amount({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={strong ? 'text-lg font-semibold' : 'text-sm font-semibold'}
      >
        {money(value)}
      </span>
    </div>
  );
}
