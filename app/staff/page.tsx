import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { StaffDirectory, type StaffMember } from '@/components/staff/staff-directory';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const STAFF_QUERY = `
  select sm.id, sm.name, sm.phone, sm.email, sm.address, sm.is_active, sm.created_at, sm.updated_at,
    sm.user_id, sm.login_id, sm.portal_active, sm.access_type, sm.staff_type, sm.portal_kind,
    coalesce(dept.rows, '[]'::json) as staff_departments,
    coalesce(mod.rows, '[]'::json) as staff_access_modules
  from public.staff_members sm
  left join lateral (
    select json_agg(json_build_object('department', d.department)) as rows
    from public.staff_departments d where d.staff_id = sm.id
  ) dept on true
  left join lateral (
    select json_agg(json_build_object('module', m.module, 'enabled', m.enabled)) as rows
    from public.staff_access_modules m where m.staff_id = sm.id
  ) mod on true
  where sm.deleted_at is null
  order by sm.name
`;

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const today = new Date().toISOString().slice(0, 10);
  let staffMembers: StaffMember[] = [];
  const assignmentCounts: Record<string, number> = {};
  let loadError = '';
  try {
    const [staffRows, bookingRows] = await withUserContext(user.id, (tx) =>
      Promise.all([
        tx.unsafe(STAFF_QUERY),
        tx<{ assigned_staff_id: number }[]>`
          select assigned_staff_id from public.bookings
          where (is_quote = false or (is_quote = true and status not in ('draft', 'cancelled')))
            and assigned_staff_id is not null
            and event_date >= ${today}
            and status in ('draft', 'confirmed', 'ready', 'out_for_delivery', 'active')
        `,
      ])
    );
    staffMembers = staffRows as unknown as StaffMember[];
    for (const booking of bookingRows) {
      if (booking.assigned_staff_id) {
        const key = String(booking.assigned_staff_id);
        assignmentCounts[key] = (assignmentCounts[key] ?? 0) + 1;
      }
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unable to load staff directory.';
  }

  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <StaffDirectory initialStaff={staffMembers} assignmentCounts={assignmentCounts} loadError={loadError} />
    </DashboardShell>
  );
}
