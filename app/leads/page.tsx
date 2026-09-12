import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { LeadsCenter } from '@/components/leads/leads-center';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  let loadError = '';
  let leads: unknown[] = [];
  let lockedDates: unknown[] = [];
  let staff: unknown[] = [];
  try {
    [leads, lockedDates, staff] = await withUserContext(user.id, (tx) =>
      Promise.all([
        tx`
          select id, full_name, phone, email, event_date, location, package_interest, source, status, requirements, assigned_staff_id
          from public.leads order by created_at desc
        `,
        tx`
          select id, locked_date, label, notes from public.lead_locked_dates
          where locked_date >= ${new Date().toISOString().slice(0, 10)} order by locked_date
        `,
        tx`select id, name from public.staff_members where is_active = true order by name`,
      ])
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unable to load leads.';
  }
  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <LeadsCenter leads={leads as never[]} lockedDates={lockedDates as never[]} staff={staff as never[]} loadError={loadError} />
    </BookingPortalShell>
  );
}
