import { notFound, redirect } from 'next/navigation';
import { BookingEditForm } from '@/components/bookings/booking-edit-form';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';

type BookingItemRow = {
  id?: number;
  product_id: number | null;
  package_id: number | null;
  package_variant_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  security_deposit: number;
};
type BookingEditRow = {
  id: number;
  booking_number: string;
  booking_type: 'sale' | 'rental';
  status: string;
  is_quote: boolean;
  customer_id: number;
  assigned_staff_id: number | null;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  contact_name: string | null;
  alternate_mobile: string | null;
  pickup_date: string | null;
  due_date: string | null;
  notes: string | null;
  discount: number;
  tax: number;
  paid_amount: number;
  booking_items: BookingItemRow[];
};

const BOOKING_EDIT_QUERY = `
  select
    b.id, b.booking_number, b.booking_type, b.status, b.is_quote, b.customer_id, b.assigned_staff_id,
    b.event_name, b.event_date, b.event_time, b.event_location, b.contact_name, b.alternate_mobile,
    b.pickup_date, b.due_date, b.notes, b.discount, b.tax, b.paid_amount,
    coalesce(items.rows, '[]'::json) as booking_items
  from public.bookings b
  left join lateral (
    select json_agg(json_build_object(
      'id', bi.id,
      'product_id', bi.product_id,
      'package_id', bi.package_id,
      'package_variant_id', bi.package_variant_id,
      'item_name', bi.item_name,
      'quantity', bi.quantity,
      'unit_price', bi.unit_price,
      'security_deposit', bi.security_deposit
    )) as rows
    from public.booking_items bi
    where bi.booking_id = b.id
  ) items on true
  where b.id = $1
  limit 1
`;

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();
  if (staffSession?.accessType === 'staff' || staffSession?.portalKind === 'accounts') {
    redirect(`/bookings/${id}`);
  }

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const { booking, customers, staff, products, packages } = await withUserContext(
    user.id,
    async (tx) => {
      const [bookingRows, customerRows, staffRows, productRows, packageRows] = (await Promise.all([
        tx.unsafe(BOOKING_EDIT_QUERY, [numericId]),
        tx.unsafe(`select id, name, phone from public.customers order by name`),
        tx.unsafe(`select id, name from public.staff_members where is_active = true order by name`),
        tx.unsafe(
          `select id, sku, barcode, name, sale_price, rental_price, security_deposit, stock_quantity
           from public.products where is_active = true order by name`,
        ),
        tx.unsafe(
          `select id, name, sale_price, rental_price, security_deposit from public.packages where is_active = true order by name`,
        ),
      ])) as unknown as [
        BookingEditRow[],
        { id: number; name: string; phone: string }[],
        { id: number; name: string }[],
        {
          id: number;
          sku: string | null;
          barcode: string | null;
          name: string;
          sale_price: number;
          rental_price: number;
          security_deposit: number;
          stock_quantity: number;
        }[],
        { id: number; name: string; sale_price: number; rental_price: number; security_deposit: number }[],
      ];
      return {
        booking: bookingRows[0] ?? null,
        customers: customerRows,
        staff: staffRows,
        products: productRows,
        packages: packageRows,
      };
    },
  );
  if (!booking) notFound();
  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <BookingEditForm
        booking={booking}
        customers={customers ?? []}
        staff={staff ?? []}
        products={products ?? []}
        packages={packages ?? []}
      />
    </BookingPortalShell>
  );
}
