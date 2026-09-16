import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { ReportsDashboard, type ReportBooking, type ReportProduct } from '@/components/reports/reports-dashboard';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = new Date();
  const defaultEnd = dateOnly(today);
  const defaultStart = dateOnly(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
  const start = typeof params.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.start) ? params.start : defaultStart;
  const end = typeof params.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.end) ? params.end : defaultEnd;
  const safeStart = start <= end ? start : end;
  const safeEnd = start <= end ? end : start;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { bookingRows, productRows, customerCount, staffCount, expenseRows } = await withUserContext(user.id, async (tx) => {
    const bookingRows = await tx<(ReportBooking & { customer_name: string | null })[]>`
      select b.id, b.booking_number, b.booking_type, b.status, b.event_date, b.total, b.paid_amount, b.balance_amount,
        c.name as customer_name
      from public.bookings b
      left join public.customers c on c.id = b.customer_id
      where b.is_quote = false and b.event_date >= ${safeStart} and b.event_date <= ${safeEnd}
      order by b.event_date desc
    `;
    const productRows = await tx<ReportProduct[]>`
      select id, name, category, stock_quantity, sale_price, rental_price, reorder_level, is_active
      from public.products order by name asc
    `;
    const [{ count: customerCount }] = await tx<{ count: string }[]>`select count(*) as count from public.customers`;
    const [{ count: staffCount }] = await tx<{ count: string }[]>`select count(*) as count from public.staff_members where is_active = true`;
    const expenseRows = await tx<{ amount: string }[]>`
      select amount from public.expenses where expense_date >= ${safeStart} and expense_date <= ${safeEnd}
    `;
    return { bookingRows, productRows, customerCount: Number(customerCount), staffCount: Number(staffCount), expenseRows };
  });

  const bookings = bookingRows.map(({ customer_name, ...booking }) => ({
    ...booking,
    total: Number(booking.total) || 0,
    paid_amount: Number(booking.paid_amount) || 0,
    balance_amount: Number(booking.balance_amount) || 0,
    customers: customer_name ? { name: customer_name } : null,
  })) as unknown as ReportBooking[];
  const products = productRows.map((product) => ({
    ...product,
    stock_quantity: Number(product.stock_quantity) || 0,
    sale_price: Number(product.sale_price) || 0,
    rental_price: Number(product.rental_price) || 0,
    reorder_level: Number(product.reorder_level) || 0,
  }));
  const expenseTotal = expenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const expenseCount = expenseRows.length;

  return <BookingPortalShell email={user.email ?? 'Safawala user'}><ReportsDashboard data={{ bookings, products, customerCount, expenseTotal, expenseCount, staffCount, start: safeStart, end: safeEnd }} /></BookingPortalShell>;
}
