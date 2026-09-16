import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { LaundryManager } from '@/components/laundry/laundry-manager';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Hand-written replacement for the PostgREST embedded select
// `laundry_batches(...vendors(...),laundry_batch_items(...),laundry_batch_notes(...))`
// — lateral joins build the same nested shape (`vendors` as a single object,
// items/notes as arrays) that LaundryManager already expects.
const BATCH_QUERY = `
  select
    b.id, b.batch_number, b.vendor_id, b.status,
    b.sent_date::text as sent_date,
    b.expected_return_date::text as expected_return_date,
    b.total_cost, b.notes,
    b.created_at::text as created_at,
    b.updated_at::text as updated_at,
    case when v.id is null then null else json_build_object('name', v.name, 'contact_person', v.contact_person, 'phone', v.phone, 'email', v.email) end as vendors,
    coalesce(items.items, '[]'::json) as laundry_batch_items,
    coalesce(notes.notes, '[]'::json) as laundry_batch_notes
  from public.laundry_batches b
  left join public.vendors v on v.id = b.vendor_id
  left join lateral (
    select json_agg(json_build_object(
      'id', i.id, 'product_id', i.product_id, 'product_name', i.product_name, 'quantity', i.quantity,
      'condition_before', i.condition_before, 'condition_after', i.condition_after, 'unit_cost', i.unit_cost, 'notes', i.notes
    )) as items
    from public.laundry_batch_items i where i.batch_id = b.id
  ) items on true
  left join lateral (
    select json_agg(json_build_object('id', n.id, 'note', n.note, 'created_at', n.created_at::text) order by n.created_at desc) as notes
    from public.laundry_batch_notes n where n.batch_id = b.id
  ) notes on true
  order by b.sent_date desc
`;

export default async function LaundryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let batches: unknown[] = [];
  let vendors: unknown[] = [];
  let products: unknown[] = [];
  let error = '';
  try {
    [batches, vendors, products] = await withUserContext(user.id, async (tx) => {
      const [batchRows, vendorRows, productRows] = await Promise.all([
        tx.unsafe(BATCH_QUERY),
        tx`select id, name, contact_person, phone, email from public.vendors where is_active = true order by name`,
        tx`select id, name, category, stock_quantity from public.products where is_active = true order by name`,
      ]);
      return [batchRows, vendorRows, productRows];
    });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unable to load laundry batches.';
  }

  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <LaundryManager initialBatches={batches as never[]} vendors={vendors as never[]} products={products as never[]} loadError={error} />
    </DashboardShell>
  );
}
