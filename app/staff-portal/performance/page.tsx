import {
  Award,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Gauge,
  Timer,
  Trophy,
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaginatedList } from '@/components/ui/paginated-list';
import { listJobs } from '@/lib/event-jobs/store';
import { getPersonalPerformanceData } from '@/lib/performance/store';
import { requirePermission } from '@/lib/staff-portal/guard';

export const dynamic = 'force-dynamic';

const DEPARTMENT_LABEL: Record<string, string> = {
  warehouse: 'Warehouse',
  qc: 'QC & Packing',
  collection: 'Collection',
  stylist: 'Stylist',
  booking: 'Booking',
  modification: 'Modification',
};

function currentIndiaMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function formatDate(value: string | null) {
  if (!value) return 'Date not recorded';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function StaffPerformancePage() {
  const session = await requirePermission('performance');
  const [data, jobs] = await Promise.all([
    getPersonalPerformanceData({
      staffMemberId: session.staffMemberId,
      userId: session.id,
      name: session.name,
    }),
    listJobs(),
  ]);

  const myStaffId = String(session.staffMemberId);
  const isStylist = session.departments.some(
    (grant) => grant.active && grant.department === 'stylist',
  );
  const stageTasks = jobs.flatMap((job) =>
    job.stages
      .filter((stage) => stage.assignedStaffId === myStaffId)
      .map((stage) => ({ job, done: stage.status === 'done' })),
  );
  const stylistTasks = isStylist
    ? jobs.flatMap((job) => {
        const approved = job.stylistInterests.some(
          (interest) =>
            interest.stylistAccountId === session.id &&
            interest.status === 'approved',
        );
        if (!approved) return [];
        const execution = job.stylistExecutions.find(
          (entry) => entry.stylistAccountId === session.id,
        );
        return [{ job, done: execution?.status === 'work_completed' }];
      })
    : [];
  const assignedTasks = [...stageTasks, ...stylistTasks];
  const completedTasks = assignedTasks.filter((item) => item.done).length;
  const pendingTasks = assignedTasks.length - completedTasks;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const overdueTasks = assignedTasks.filter(
    ({ job, done }) =>
      !done &&
      Boolean(job.eventSummary.eventDate) &&
      job.eventSummary.eventDate < today,
  ).length;
  const completionRate = assignedTasks.length
    ? Math.round((completedTasks / assignedTasks.length) * 100)
    : 0;

  const monthKey = currentIndiaMonth();
  const monthAttendance = data.attendance.filter(
    (record) => record.date.slice(0, 7) === monthKey,
  );
  const presentDays = monthAttendance.filter((record) =>
    ['present', 'late', 'half_day'].includes(record.status),
  ).length;
  const workingHours = monthAttendance.reduce(
    (sum, record) => sum + record.workingHours,
    0,
  );
  const overtime = monthAttendance.reduce(
    (sum, record) => sum + record.overtime,
    0,
  );
  const completedWork = data.credits;

  const kpis = [
    {
      label: 'Completed events',
      value: data.credits.length,
      note: 'Total credited work',
      icon: Trophy,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Completion rate',
      value: `${completionRate}%`,
      note: `${completedTasks} of ${assignedTasks.length} assigned tasks`,
      icon: Gauge,
      tone: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Pending tasks',
      value: pendingTasks,
      note: overdueTasks ? `${overdueTasks} overdue` : 'Nothing overdue',
      icon: Clock3,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Present this month',
      value: presentDays,
      note: `${monthAttendance.length} attendance records`,
      icon: CalendarCheck2,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Working hours',
      value: workingHours.toFixed(1),
      note: 'This month',
      icon: Timer,
      tone: 'bg-cyan-50 text-cyan-700',
    },
    {
      label: 'Overtime',
      value: `${overtime.toFixed(1)}h`,
      note: 'This month',
      icon: Award,
      tone: 'bg-rose-50 text-rose-700',
    },
  ];

  return (
    <StaffPortalShell
      language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
      portalKind={session.portalKind}
    >
      <div className="mx-auto max-w-[1200px] space-y-5 sm:space-y-6">
        <DashboardHeader
          title="My Performance"
          subtitle="Your completed work, task progress and attendance summary"
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {kpis.map(({ label, value, note, icon: Icon, tone }) => (
            <Card
              key={label}
              className="min-w-0 border-border py-0 shadow-level-1"
            >
              <CardContent className="p-3.5 sm:p-5">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-xs">
                      {label}
                    </p>
                    <p className="mt-1 text-xl font-semibold leading-none sm:text-2xl">
                      {value}
                    </p>
                  </div>
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}
                  >
                    <Icon className="size-4 sm:size-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 truncate text-[11px] text-muted-foreground sm:text-xs">
                  {note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border py-0 shadow-level-1">
          <CardHeader className="border-b border-border px-4 py-4 sm:px-5">
            <CardTitle className="text-base">Recent completed work</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {completedWork.length ? (
              <PaginatedList
                itemLabel="completed work records"
                pageSize={10}
                contentClassName="divide-y divide-border"
              >
                {completedWork.map((credit) => (
                  <article
                    key={`${credit.eventJobId}-${credit.department}`}
                    className="flex min-w-0 items-center gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#f5ead8] text-[#8a581f]">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {credit.eventName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {credit.bookingNumber || credit.eventJobId} ·{' '}
                        {formatDate(credit.eventDate || credit.creditedAt)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] sm:text-xs"
                    >
                      {DEPARTMENT_LABEL[credit.department] ?? credit.department}
                    </Badge>
                  </article>
                ))}
              </PaginatedList>
            ) : (
              <div className="grid min-h-48 place-items-center p-6 text-center">
                <div>
                  <Trophy
                    className="mx-auto size-9 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="mt-3 font-semibold">No completed work yet</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Completed event credit will appear here after the booking
                    team closes the job.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffPortalShell>
  );
}
