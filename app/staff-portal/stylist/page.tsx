import Link from 'next/link';
import { CalendarClock, MapPin, Sparkles, UsersRound, UserRound, ClipboardList } from 'lucide-react';
import { requireStylistSession } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { stylistJobsForAccount, stylistJobsForMainAccount } from '@/lib/event-jobs/store';
import { unreadCountForSession } from '@/lib/notifications/store';
import type { StylistInterestStatus } from '@/lib/event-jobs/types';
import {
  StylistInterestButton,
  WithdrawInterestButton,
} from '@/components/staff-portal/stylist-interest-button';
import { StylistJobModal } from '@/components/staff-portal/stylist-job-modal';
import { withServiceRole } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<StylistInterestStatus, string> = {
  interested: 'Interested — pending admin approval',
  approved: 'Approved',
  rejected: 'Not selected',
  backup: 'Backup',
};

const STATUS_TONE: Record<StylistInterestStatus, string> = {
  interested: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-stone-200 bg-stone-50 text-stone-600',
  backup: 'border-sky-200 bg-sky-50 text-sky-700',
};

async function StylistMainDashboard({
  session,
  jobs,
  page = 1,
  pageSize = 5,
}: {
  session: Awaited<ReturnType<typeof requireStylistSession>>;
  jobs: Awaited<ReturnType<typeof stylistJobsForMainAccount>>;
  page?: number;
  pageSize?: number;
}) {
  const stylists = await withServiceRole(async (tx) => {
    const accountRows = await tx<{ owner_id: string }[]>`
      select owner_id from public.staff_members where user_id = ${session.id} limit 1
    `;
    const ownerId = accountRows[0]?.owner_id;
    if (!ownerId) return [];
    return tx<
      {
        id: number;
        name: string;
        login_id: string | null;
        user_id: string | null;
        staff_type: string;
        is_active: boolean;
        portal_active: boolean;
      }[]
    >`
      select id, name, login_id, user_id, staff_type, is_active, portal_active
      from public.staff_members
      where owner_id = ${ownerId} and staff_type = 'stylist' and is_active = true and portal_active = true
      order by name
    `;
  });
  const approvedAssignments = jobs.flatMap((job) =>
    job.stylistInterests.filter((interest) => interest.status === 'approved'),
  );
  const assignedStylistIds = new Set(approvedAssignments.map((interest) => interest.stylistAccountId));
  const eventsNeedingStylists = jobs.filter(
    (job) => job.stylistInterests.filter((interest) => interest.status === 'approved').length < job.stylistsRequiredCount,
  );
  const completedEvents = jobs.filter((job) =>
    job.status === 'closed' || job.stylistExecutions.some((entry) => entry.status === 'work_completed'),
  ).length;
  const liveEvents = jobs.filter((job) =>
    job.stylistExecutions.some((entry) => entry.status === 'reached_venue' || entry.status === 'work_started'),
  ).length;
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const pageJobs = jobs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-5">
      <div className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {[
          { label: 'Total stylists', value: stylists.length, icon: UsersRound },
          { label: 'Assigned stylists', value: assignedStylistIds.size, icon: UserRound },
          { label: 'Events needing stylists', value: eventsNeedingStylists.length, icon: ClipboardList },
          { label: 'Live / completed events', value: `${liveEvents} / ${completedEvents}`, icon: CalendarClock },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border shadow-level-1">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" /></span>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border shadow-level-1">
        <CardContent className="p-0">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Event assignment overview</h2><p className="mt-1 text-xs text-muted-foreground">See who is assigned, what is still open, and the current event status.</p></div>
          {jobs.length ? <><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-xs text-muted-foreground"><span>Showing <strong className="text-foreground">{(currentPage - 1) * pageSize + 1}</strong> to <strong className="text-foreground">{Math.min(currentPage * pageSize, jobs.length)}</strong> of <strong className="text-foreground">{jobs.length}</strong> events</span><div className="flex flex-wrap items-center gap-2"><span>Items per page</span>{[5, 10, 20].map((size) => <Link key={size} href={`/staff-portal/stylist?page=1&pageSize=${size}`} className={`rounded-lg border px-2.5 py-1.5 ${pageSize === size ? 'border-primary bg-accent font-semibold text-foreground' : 'hover:bg-accent'}`}>{size}</Link>)}<span className="ml-1 hidden sm:inline">· Page {currentPage} of {totalPages}</span><Link aria-disabled={currentPage === 1} className={`rounded-lg border px-2.5 py-1.5 ${currentPage === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-accent'}`} href={`/staff-portal/stylist?page=${currentPage - 1}&pageSize=${pageSize}`}>Previous</Link><Link aria-disabled={currentPage === totalPages} className={`rounded-lg border px-2.5 py-1.5 ${currentPage === totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-accent'}`} href={`/staff-portal/stylist?page=${currentPage + 1}&pageSize=${pageSize}`}>Next</Link></div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-[#faf8f4] text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Event / customer</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Assigned stylists</th><th className="px-5 py-3 font-medium">Status</th></tr></thead><tbody>{pageJobs.map((job) => { const approved = job.stylistInterests.filter((interest) => interest.status === 'approved'); const remaining = Math.max(job.stylistsRequiredCount - approved.length, 0); const live = job.stylistExecutions.some((entry) => entry.status === 'reached_venue' || entry.status === 'work_started'); const completed = job.status === 'closed' || job.stylistExecutions.some((entry) => entry.status === 'work_completed'); return <tr key={job.id} className="border-b last:border-0"><td className="px-5 py-3"><p className="font-medium">{job.eventSummary.eventName}</p><p className="mt-0.5 text-xs text-[#70481c]">{job.eventSummary.customerName || 'Customer not added'}</p></td><td className="px-5 py-3 text-xs text-muted-foreground">{friendlyDate(job.eventSummary.eventDate)}{job.eventSummary.venue ? ` · ${job.eventSummary.venue}` : ''}</td><td className="px-5 py-3 text-xs">{approved.length ? <span>{approved.map((interest) => interest.stylistName).join(', ')}</span> : <span className="text-muted-foreground">No stylist assigned</span>}</td><td className="px-5 py-3"><Badge variant="outline" className={completed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : live ? 'border-sky-200 bg-sky-50 text-sky-700' : remaining ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>{completed ? 'Event completed' : live ? 'Live event' : remaining ? `${remaining} slot${remaining === 1 ? '' : 's'} left` : 'Fully assigned'}</Badge></td></tr>; })}</tbody></table></div></> : <p className="p-8 text-center text-sm text-muted-foreground">No stylist events yet.</p>}
        </CardContent>
      </Card>

      <Card className="border-border shadow-level-1">
        <CardContent className="p-0"><div className="border-b px-5 py-4"><h2 className="font-semibold">Stylist workload</h2><p className="mt-1 text-xs text-muted-foreground">Assignments across all active stylists.</p></div><div className="divide-y divide-border">{stylists.map((stylist) => { const assigned = approvedAssignments.filter((interest) => interest.stylistAccountId === stylist.user_id || interest.stylistAccountId === stylist.login_id).length; return <div key={stylist.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{stylist.name}</p><p className="text-xs text-muted-foreground">{stylist.login_id || 'No login ID'}</p></div><Badge variant="outline">{assigned} assigned event{assigned === 1 ? '' : 's'}</Badge></div>; })}{!stylists.length ? <p className="p-8 text-center text-sm text-muted-foreground">No active stylists found.</p> : null}</div></CardContent>
      </Card>
    </div>
  );
}

export default async function StaffStylistPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; page?: string; pageSize?: string }>;
}) {
  const session = await requireStylistSession();
  const jobs = session.isMainId
    ? await stylistJobsForMainAccount()
    : await stylistJobsForAccount(session.id);
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? '1', 10) || 1;
  const requestedPageSize = Number.parseInt(params.pageSize ?? '5', 10);
  const pageSize = [5, 10, 20].includes(requestedPageSize) ? requestedPageSize : 5;
  const activeDepartments = session.departments
    .filter((grant) => grant.active)
    .map((grant) => grant.department);
  const notificationCount = await unreadCountForSession(
    session.id,
    activeDepartments,
  );

  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
      notificationCount={notificationCount}
    >
      <div className="mx-auto max-w-[1120px] space-y-4">
        <DashboardHeader
          title="Stylist"
          subtitle={session.isMainId
            ? 'All stylist opportunities and event progress'
            : 'Available events — mark yourself as interested and available'}
        />

        {session.isMainId ? <StylistMainDashboard session={session} jobs={jobs} page={page} pageSize={pageSize} /> : <Card className="gap-0 overflow-hidden border-[#e2cfb5] bg-[radial-gradient(circle_at_top_left,#fbf4e9_0%,#f6efe5_38%,#f3ede5_100%)] py-0 shadow-level-1 dark:border-[#493822]">
          <CardContent className="p-0">
            {jobs.length ? (
              <ul className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => {
                  const myInterest = job.stylistInterests.find(
                    (interest) => interest.stylistAccountId === session.id,
                  );
                  const execution = job.stylistExecutions.find(
                    (entry) => entry.stylistAccountId === session.id,
                  );
                  const interestedCount = job.stylistInterests.filter(
                    (interest) => interest.status === 'interested',
                  ).length;
                  const rentalQuantity = job.requiredItems.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  );
                  return (
                    <li
                      key={job.id}
                      className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-[#e4d2b6] bg-white p-4 shadow-level-1 transition hover:border-primary/35 hover:shadow-level-2 dark:border-[#493822] dark:bg-card"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-primary">{job.id}</span><Badge variant="outline" className="border-[#dfc6a4] bg-[#f5ead8] text-[10px] text-[#70481c]">Rental</Badge></div>
                        <p className="font-semibold">
                          {job.eventSummary.customerName || 'Customer not added'}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-medium text-[#70481c]">
                          {job.eventSummary.eventName} · {job.bookingNumber}
                        </p>
                        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#fcfaf7] px-3 py-2.5 text-xs text-muted-foreground dark:bg-[#241e17]">
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5" />{' '}
                            {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                            {friendlyTime(job.eventSummary.eventTime)}
                          </span>
                          {job.eventSummary.venue ? (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="size-3.5" />{' '}
                              {job.eventSummary.venue}
                            </span>
                          ) : null}
                          <span>{rentalQuantity} rental items</span>
                          <span>
                            {job.stylistsRequiredCount} required ·{' '}
                            {interestedCount} interested
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t border-[#eadcc8] pt-3 dark:border-[#493822] [&_[data-slot=button]]:min-h-9">
                        <Button
                          variant="outline"
                          size="sm"
                          render={
                            <Link
                              href={`/staff-portal/stylist?job=${encodeURIComponent(job.id)}`}
                            />
                          }
                        >
                          View details
                        </Button>
                        {session.isMainId ? (
                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            {job.stylistInterests.filter((interest) => interest.status === 'approved').length} approved · {job.stylistInterests.length} total
                          </Badge>
                        ) : myInterest ? (
                          <>
                            {execution?.status === 'reached_venue' || execution?.status === 'work_started' ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                Live event
                              </Badge>
                            ) : execution?.status === 'work_completed' ? (
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                Event completed
                              </Badge>
                            ) : null}
                            {myInterest.status === 'interested' ? (
                              <WithdrawInterestButton jobId={job.id} />
                            ) : null}
                            <Badge
                              variant="outline"
                              className={STATUS_TONE[myInterest.status]}
                            >
                              {STATUS_LABEL[myInterest.status]}
                            </Badge>
                          </>
                        ) : (
                          <StylistInterestButton jobId={job.id} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                    <Sparkles />
                  </span>
                  <h3 className="mt-4 font-semibold">
                    No open styling opportunities right now
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New confirmed bookings that need a stylist will appear here.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>}
      </div>
      {params.job ? <StylistJobModal jobId={params.job} /> : null}
    </StaffPortalShell>
  );
}
