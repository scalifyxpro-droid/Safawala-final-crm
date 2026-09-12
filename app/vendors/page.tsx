import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { VendorManager, type Vendor } from '@/components/vendors/vendor-manager';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

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
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <VendorManager vendors={vendors} loadError={loadError} />
    </DashboardShell>
  );
}
