import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePermission } from '@/lib/staff-portal/guard';
import { withUserContext } from '@/lib/db/client';

export default async function StaffPerformancePage() {
  const session = await requirePermission('performance');
  const data = await withUserContext(session.id, (tx) => tx<
    { id: number; name: string; department: string; credited_at: string }[]
  >`
    select id, name, department, credited_at
    from public.staff_performance_credits
    where staff_id = ${session.staffMemberId}
    order by credited_at desc
  `);
  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1200px] space-y-6">
        <DashboardHeader title="My Performance" subtitle="Completed-event credits and personal progress" />
        <Card className="border-border shadow-level-1">
          <CardHeader>
            <CardTitle>Completed-event credits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{data?.length ?? 0}</p>
            <p className="mt-1 text-sm text-muted-foreground">Total credited event assignments</p>
          </CardContent>
        </Card>
      </div>
    </StaffPortalShell>
  );
}
