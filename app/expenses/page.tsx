import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { FinanceManager, type FinanceRecord } from '@/components/finance/finance-manager';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
export const dynamic = 'force-dynamic';
export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  let data: FinanceRecord[] = [];
  let error = '';
  try {
    data = await withUserContext(user.id, (tx) => tx<FinanceRecord[]>`select * from public.expenses order by expense_date desc`);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unable to load expenses.';
  }
  return <BookingPortalShell email={user.email ?? 'Safawala user'}><FinanceManager mode="expenses" initialRecords={data} loadError={error} email={user.email ?? ''} /></BookingPortalShell>;
}
