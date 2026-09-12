import { redirect } from 'next/navigation';
import { PackageManagement, type PackageCategory } from '@/components/packages/package-management';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Hand-written replacement for the embedded select
// `package_categories(...package_variants(...))`.
const CATEGORY_QUERY = `
  select c.id, c.name, c.is_active, c.created_at, c.updated_at,
    coalesce(v.rows, '[]'::json) as package_variants
  from public.package_categories c
  left join lateral (
    select json_agg(json_build_object(
      'id', pv.id, 'category_id', pv.category_id, 'name', pv.name, 'base_price', pv.base_price,
      'inclusions', pv.inclusions, 'extra_safa_price', pv.extra_safa_price, 'missing_safa_penalty', pv.missing_safa_penalty,
      'security_deposit', pv.security_deposit, 'created_at', pv.created_at, 'updated_at', pv.updated_at
    ) order by pv.created_at) as rows
    from public.package_variants pv where pv.category_id = c.id
  ) v on true
  where c.is_active = true
  order by c.created_at asc
`;

export default async function PackagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let categories: PackageCategory[] = [];
  let loadError = '';
  try {
    const rows = await withUserContext(user.id, (tx) => tx.unsafe(CATEGORY_QUERY));
    categories = (rows as unknown as PackageCategory[]).map((category) => ({
      ...category,
      package_variants: [...(category.package_variants ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unable to load packages.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <PackageManagement initialCategories={categories} loadError={loadError} />
    </BookingPortalShell>
  );
}
