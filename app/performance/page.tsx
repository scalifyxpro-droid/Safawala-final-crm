import type { ReactNode } from 'react';
import {
  CalendarCheck2,
  Clock3,
  Timer,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaginatedList } from '@/components/ui/paginated-list';
import { getCurrentUser } from '@/lib/auth/session';
import { listStaffPerformanceOverview } from '@/lib/performance/store';

export const dynamic = 'force-dynamic';

const DEPARTMENT_LABEL: Record<string, string> = {
  warehouse: 'Warehouse',
  qc: 'QC & Packing',
  collection: 'Collection',
  stylist: 'Stylist',
  booking: 'Booking',
  modification: 'Modification',
};

function formatDate(value: string | null) {
  if (!value) return 'No completed work yet';
  return `Last credit ${new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))}`;
}

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staff = await listStaffPerformanceOverview();
  const totalCompleted = staff.reduce(
    (sum, member) => sum + member.completedEvents,
    0,
  );
  const completedThisMonth = staff.reduce(
    (sum, member) => sum + member.completedThisMonth,
    0,
  );
  const totalHours = staff.reduce(
    (sum, member) => sum + member.workingHours,
    0,
  );

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1280px] space-y-5 sm:space-y-6">
        <DashboardHeader
          title="Staff Performance"
          subtitle="Individual completed work and current-month attendance overview"
          backHref="/dashboard"
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: 'Active staff',
              value: staff.length,
              note: 'With portal access',
              icon: UsersRound,
              tone: 'bg-blue-50 text-blue-700',
            },
            {
              label: 'Completed events',
              value: totalCompleted,
              note: 'All-time credits',
              icon: Trophy,
              tone: 'bg-amber-50 text-amber-700',
            },
            {
              label: 'This month',
              value: completedThisMonth,
              note: 'Completed-event credits',
              icon: CalendarCheck2,
              tone: 'bg-emerald-50 text-emerald-700',
            },
            {
              label: 'Working hours',
              value: totalHours.toFixed(1),
              note: 'Team total this month',
              icon: Timer,
              tone: 'bg-violet-50 text-violet-700',
            },
          ].map(({ label, value, note, icon: Icon, tone }) => (
            <Card
              key={label}
              className="min-w-0 border-border py-0 shadow-level-1"
            >
              <CardContent className="p-3.5 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-xs">
                      {label}
                    </p>
                    <p className="mt-1 text-xl font-semibold sm:text-2xl">
                      {value}
                    </p>
                  </div>
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}
                  >
                    <Icon className="size-4 sm:size-5" />
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">
                  {note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden border-border py-0 shadow-level-1">
          <CardHeader className="border-b border-border px-4 py-4 sm:px-5">
            <CardTitle className="text-base">
              Individual staff overview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {staff.length ? (
              <PaginatedList
                itemLabel="staff members"
                pageSize={10}
                contentClassName="divide-y divide-border"
              >
                {staff.map((member) => (
                  <article key={member.staffMemberId} className="p-4 sm:p-5">
                    <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5ead8] text-xs font-bold text-[#70481c]">
                          {member.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {member.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.loginId} · {formatDate(member.lastCreditAt)}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {member.departments.map((department) => (
                              <Badge
                                key={department}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {DEPARTMENT_LABEL[department] ?? department}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:w-[650px]">
                        <Metric
                          label="Completed"
                          value={member.completedEvents}
                          icon={<Trophy />}
                        />
                        <Metric
                          label="This month"
                          value={member.completedThisMonth}
                          icon={<CalendarCheck2 />}
                        />
                        <Metric
                          label="Present days"
                          value={member.attendanceDays}
                          icon={<Clock3 />}
                        />
                        <Metric
                          label="Hours"
                          value={member.workingHours.toFixed(1)}
                          icon={<Timer />}
                        />
                        <Metric
                          label="Overtime"
                          value={`${member.overtime.toFixed(1)}h`}
                          icon={<Clock3 />}
                          className="col-span-2 sm:col-span-1"
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </PaginatedList>
            ) : (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <UsersRound className="mx-auto size-10 text-primary" />
                  <h3 className="mt-3 font-semibold">No active staff found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Staff performance will appear after staff portal accounts
                    are activated.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BookingPortalShell>
  );
}

function Metric({
  label,
  value,
  icon,
  className = '',
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-border bg-[#fcfaf7] p-2.5 dark:bg-[#241e17] ${className}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground [&_svg]:size-3">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
