import { redirect } from 'next/navigation';
import { CustomerDirectory, type CustomerBooking, type CustomerRecord } from '@/components/customers/customer-directory';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();

  let customers: CustomerRecord[] = [];
  let bookings: CustomerBooking[] = [];
  let loadError = '';
  try {
    [customers, bookings] = await withUserContext(user.id, (tx) =>
      Promise.all([
        tx<CustomerRecord[]>`
          select id, name, phone, email, address, notes, created_at, updated_at
          from public.customers order by created_at desc
        `,
        tx<CustomerBooking[]>`
          select id, booking_number, booking_type, status, event_name, event_date, total, balance_amount, customer_id, created_at
          from public.bookings
          where (is_quote = false or (is_quote = true and status not in ('draft', 'cancelled')))
          order by created_at desc
        `,
      ])
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unable to load customers.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <CustomerDirectory
        initialCustomers={customers}
        bookings={bookings}
        loadError={loadError}
        readOnly={staffSession?.portalKind === 'accounts'}
      />
    </BookingPortalShell>
  );
}
