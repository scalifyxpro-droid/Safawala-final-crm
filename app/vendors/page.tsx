import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { VendorManager, type Vendor } from '@/components/vendors/vendor-manager';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { getStaffSession } from '@/lib/staff-portal/session';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();

  let vendors: Vendor[] = [];
  let loadError = '';
  try {
    vendors = await withUserContext(user.id, (tx) => tx<Vendor[]>`
      select id, name, contact_person, phone, email, address, notes, is_active, created_at
      from public.vendors
      order by created_at desc
    `);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load vendors.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <VendorManager
        vendors={vendors}
        loadError={loadError}
        readOnly={staffSession?.portalKind === 'accounts'}
      />
    </BookingPortalShell>
  );
}
