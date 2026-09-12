import { redirect } from 'next/navigation';
import { InventoryDirectory, type InventoryProduct } from '@/components/inventory/inventory-directory';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const INVENTORY_QUERY = `
  select
    p.id, p.sku, p.barcode, p.name, p.description, p.category, p.subcategory, p.size, p.color,
    p.material, p.cost_price, p.regular_price, p.sale_price, p.rental_price, p.security_deposit,
    p.stock_quantity, p.reorder_level, p.image_urls, p.is_active, p.created_at, p.updated_at,
    coalesce(variants.rows, '[]'::json) as product_variants
  from public.products p
  left join lateral (
    select json_agg(json_build_object(
      'id', pv.id, 'name', pv.name, 'size', pv.size, 'color', pv.color,
      'material', pv.material, 'stock_quantity', pv.stock_quantity, 'barcode', pv.barcode
    )) as rows
    from public.product_variants pv where pv.product_id = p.id
  ) variants on true
  order by p.created_at desc
`;

export default async function ProductArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let data: InventoryProduct[] = [];
  let loadError = '';
  try {
    data = (await withUserContext(user.id, (tx) => tx.unsafe(INVENTORY_QUERY))) as unknown as InventoryProduct[];
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load the product archive.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <InventoryDirectory
        initialProducts={data}
        loadError={loadError}
        initialShowArchived
        headerTitle="Product Archive"
        headerSubtitle="Review and restore products removed from the active catalog"
      />
    </BookingPortalShell>
  );
}
