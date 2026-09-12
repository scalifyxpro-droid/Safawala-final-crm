import { notFound, redirect } from 'next/navigation';
import { CustomerLedgerDetail } from '@/components/ledger/customer-ledger-detail';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import type { LedgerBooking, LedgerCustomer } from '@/lib/ledger';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const BOOKINGS_QUERY = `
  select b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.customer_id,
    b.event_name, b.event_date, b.total, b.paid_amount, b.balance_amount, b.created_at,
    coalesce(payments.rows, '[]'::json) as booking_payments
  from public.bookings b
  left join lateral (
    select json_agg(json_build_object(
      'id', p.id, 'amount', p.amount, 'payment_method', p.payment_method,
      'reference_number', p.reference_number, 'notes', p.notes,
      'paid_at', p.paid_at, 'created_at', p.created_at
    )) as rows
    from public.booking_payments p where p.booking_id = b.id
  ) payments on true
  where b.customer_id = $1 and b.is_quote = false and b.status <> 'cancelled'
  order by b.created_at
`;

export default async function CustomerLedgerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  if (!/^\d+$/.test(customerId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const numericId = Number(customerId);
  let customer: LedgerCustomer | null = null;
  let bookings: LedgerBooking[] = [];
  let loadError = '';
  try {
    const result = await withUserContext(user.id, async (tx) => {
      const [customerRow] = await tx<LedgerCustomer[]>`
        select id, name, phone, email, address, created_at from public.customers where id = ${numericId}
      `;
      const bookings = await tx.unsafe(BOOKINGS_QUERY, [numericId]);
      return { customerRow, bookings: bookings as unknown as LedgerBooking[] };
    });
    customer = result.customerRow ?? null;
    bookings = result.bookings;
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load this customer.';
  }
  if (!customer) notFound();

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <CustomerLedgerDetail
        customer={customer}
        bookings={bookings}
        loadError={loadError}
      />
    </BookingPortalShell>
  );
}
