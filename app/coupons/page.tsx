import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { CouponsManager, type CouponOffer } from '@/components/coupons/coupons-manager';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function CouponsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  let data: CouponOffer[] = [];
  let error = '';
  try {
    data = await withUserContext(user.id, (tx) => tx<CouponOffer[]>`
      select id, code, name, discount_type, value, is_active, created_at from public.coupon_offers order by created_at desc
    `);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unable to load coupon offers.';
  }
  return <DashboardShell email={user.email ?? 'Safawala user'}><CouponsManager offers={data} loadError={error} /></DashboardShell>;
}
