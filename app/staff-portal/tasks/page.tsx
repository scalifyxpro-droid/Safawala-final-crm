import { CheckSquare } from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { STAGE_DEPARTMENT, STAGE_LABEL } from '@/lib/event-jobs/constants';
import { listJobs } from '@/lib/event-jobs/store';
import { requirePermission } from '@/lib/staff-portal/guard';

export const dynamic = 'force-dynamic';

export default async function MyTasksPage() {
  const [session, jobs] = await Promise.all([requirePermission('my_tasks'), listJobs()]);
  const departments = new Set(session.departments.filter((grant) => grant.active).map((grant) => grant.department));
  const tasks = jobs.flatMap((job) => job.stages.filter((stage) => stage.status !== 'done' && (stage.assignedStaffId === String(session.staffMemberId) || (session.isMainId && departments.has(STAGE_DEPARTMENT[stage.key])))).map((stage) => ({ job, stage })));
  return <StaffPortalShell language={session.languagePreference} name={session.name} departments={session.departments} permissions={session.permissions} isMainId={session.isMainId}>
    <div className="mx-auto max-w-[1200px] space-y-6"><DashboardHeader title="My Tasks" subtitle="Operational work assigned to you or your department" />
      <Card className="overflow-hidden border-border py-0 shadow-level-1"><CardContent className="p-0">{tasks.length ? <div className="divide-y divide-border">{tasks.map(({ job, stage }) => <div key={`${job.id}-${stage.key}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{STAGE_LABEL[stage.key]}</p><p className="text-sm text-muted-foreground">{job.eventSummary.eventName} · {job.id}</p></div><Badge variant="outline" className="w-fit capitalize">{stage.status.replace('_', ' ')}</Badge></div>)}</div> : <div className="grid min-h-52 place-items-center p-8 text-center"><div><CheckSquare className="mx-auto size-9 text-primary" /><h3 className="mt-3 font-semibold">No pending tasks</h3><p className="mt-1 text-sm text-muted-foreground">Assigned department work will appear here.</p></div></div>}</CardContent></Card>
    </div>
  </StaffPortalShell>;
}
