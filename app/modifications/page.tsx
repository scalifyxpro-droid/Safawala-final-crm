import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { ModificationQueue, type ModificationBooking } from '@/components/modifications/modification-queue';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Hand-written replacement for the embedded select
// `bookings(...customers(...),staff_members!bookings_assigned_staff_id_fkey(name),
//   booking_items(...products(...)),booking_activity(...))`.
const BOOKINGS_QUERY = `
  select b.id, b.booking_number, b.booking_type, b.is_quote, b.status, b.event_name,
    b.event_date::text as event_date, b.event_time::text as event_time,
    b.event_location, b.pickup_date::text as pickup_date, b.due_date::text as due_date,
    b.subtotal, b.discount, b.tax, b.security_deposit, b.total,
    b.paid_amount, b.balance_amount, b.notes, b.created_at::text as created_at,
    case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone, 'address', c.address) end as customers,
    case when sm.id is null then null else json_build_object('name', sm.name) end as staff_members,
    coalesce(items.rows, '[]'::json) as booking_items,
    coalesce(activity.rows, '[]'::json) as booking_activity
  from public.bookings b
  left join public.customers c on c.id = b.customer_id
  left join public.staff_members sm on sm.id = b.assigned_staff_id
  left join lateral (
    select json_agg(json_build_object(
      'id', bi.id, 'item_name', bi.item_name, 'quantity', bi.quantity, 'unit_price', bi.unit_price,
      'line_total', bi.line_total, 'product_id', bi.product_id,
      'products', case when p.id is null then null else json_build_object('image_urls', p.image_urls, 'barcode', p.barcode) end
    )) as rows
    from public.booking_items bi left join public.products p on p.id = bi.product_id
    where bi.booking_id = b.id
  ) items on true
  left join lateral (
    select json_agg(json_build_object('id', a.id, 'action', a.action, 'details', a.details, 'created_at', a.created_at)) as rows
    from public.booking_activity a where a.booking_id = b.id
  ) activity on true
  where b.booking_type = 'sale'
    and (b.is_quote = false or (b.is_quote = true and b.status not in ('draft', 'cancelled')))
    and b.notes ilike '%SALE MODIFICATION REQUIRED%'
  order by b.created_at desc, b.id desc
`;

export default async function ModificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let bookings: ModificationBooking[] = [];
  let loadError = '';
  try {
    const rows = await withUserContext(user.id, (tx) => tx.unsafe(BOOKINGS_QUERY));
    bookings = rows as unknown as ModificationBooking[];
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unable to load modification requests.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <ModificationQueue initialBookings={bookings} loadError={loadError} />
    </BookingPortalShell>
  );
}
