import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { ModificationQueue, type ModificationBooking } from '@/components/modifications/modification-queue';
import { withServiceRole } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const MODIFICATION_QUERY = `
  select
    b.id, b.booking_number, b.booking_type, b.is_quote, b.status, b.event_name, b.event_date,
    b.event_time, b.event_location, b.pickup_date, b.due_date, b.subtotal, b.discount, b.tax,
    b.security_deposit, b.total, b.paid_amount, b.balance_amount, b.notes, b.created_at,
    case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone, 'address', c.address) end as customers,
    case when s.id is null then null else json_build_object('name', s.name) end as staff_members,
    coalesce(items.rows, '[]'::json) as booking_items,
    coalesce(activity.rows, '[]'::json) as booking_activity
  from public.bookings b
  left join public.customers c on c.id = b.customer_id
  left join public.staff_members s on s.id = b.assigned_staff_id
  left join lateral (
    select json_agg(json_build_object(
      'id', bi.id,
      'item_name', bi.item_name,
      'quantity', bi.quantity,
      'unit_price', bi.unit_price,
      'line_total', bi.line_total,
      'product_id', bi.product_id,
      'products', case when p.id is null then null else json_build_object('image_urls', p.image_urls, 'barcode', p.barcode) end
    )) as rows
    from public.booking_items bi
    left join public.products p on p.id = bi.product_id
    where bi.booking_id = b.id
  ) items on true
  left join lateral (
    select json_agg(json_build_object('id', ba.id, 'action', ba.action, 'details', ba.details, 'created_at', ba.created_at)) as rows
    from public.booking_activity ba
    where ba.booking_id = b.id
  ) activity on true
  where b.booking_type = 'sale' and b.notes ilike $1
  order by b.event_date
`;

export default async function StaffModificationPage() {
  const session = await requireDepartment('modification');

  const { data, error } = await withServiceRole(async (tx) => {
    try {
      const rows = await tx.unsafe(MODIFICATION_QUERY, ['%SALE MODIFICATION REQUIRED%']);
      return { data: rows as unknown as ModificationBooking[], error: null as Error | null };
    } catch (queryError) {
      return {
        data: [] as ModificationBooking[],
        error: queryError instanceof Error ? queryError : new Error('Unable to load modifications.'),
      };
    }
  });

  return (
    <StaffPortalShell
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
    >
      <ModificationQueue initialBookings={data ?? []} loadError={error?.message ?? ''} staffMode />
    </StaffPortalShell>
  );
}
