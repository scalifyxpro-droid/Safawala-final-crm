import { redirect } from 'next/navigation';
import { InventoryDirectory } from '@/components/inventory/inventory-directory';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { getInventoryPageData } from '@/lib/inventory-page-data';

export const dynamic = 'force-dynamic';

export default async function ProductArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let data = await getInventoryPageData(user.id, {
    page: 1,
    pageSize: 10,
    archived: true,
  }).catch(() => null);
  let loadError = '';
  if (!data) {
    loadError = 'Unable to load the product archive.';
    data = {
      products: [],
      reservations: [],
      total: 0,
      page: 1,
      summary: {
        activeCount: 0,
        archivedCount: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        inventoryValue: 0,
      },
      subcategories: [],
    };
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <InventoryDirectory
        initialData={data}
        loadError={loadError}
        initialShowArchived
        headerTitle="Product Archive"
        headerSubtitle="Review and restore products removed from the active catalog"
      />
    </BookingPortalShell>
  );
}
