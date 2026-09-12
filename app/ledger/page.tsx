import { redirect } from 'next/navigation';
import { CustomerLedgerDirectory } from '@/components/ledger/customer-ledger-directory';
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
  where b.is_quote = false and b.status <> 'cancelled'
`;

export default async function CustomerLedgerPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let customers: LedgerCustomer[] = [];
  let bookings: LedgerBooking[] = [];
  let loadError = '';
  try {
    [customers, bookings] = await withUserContext(user.id, async (tx) => {
      const customers = await tx<LedgerCustomer[]>`
        select id, name, phone, email, address, created_at from public.customers order by name
      `;
      const bookings = await tx.unsafe(`${BOOKINGS_QUERY} order by b.created_at desc`);
      return [customers, bookings as unknown as LedgerBooking[]];
    });
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load the ledger.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <CustomerLedgerDirectory
        customers={customers}
        bookings={bookings}
        loadError={loadError}
      />
    </BookingPortalShell>
  );
}
