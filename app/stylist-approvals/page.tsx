import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarClock, MapPin, UserCheck, UsersRound } from 'lucide-react';
import { setStylistsRequiredAction } from '@/app/stylist-approvals/actions';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StylistAssignmentPanel } from '@/components/stylist/stylist-assignment-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PaginatedList } from '@/components/ui/paginated-list';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { stylistJobsForAdmin } from '@/lib/event-jobs/store';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import { compareJobsByBookingDate } from '@/lib/event-jobs/sorting';

export const dynamic = 'force-dynamic';

type StylistView = 'all' | 'awaiting' | 'assigned';

export default async function StylistApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const requestedView = (await searchParams).view;
  const view: StylistView =
    requestedView === 'awaiting' || requestedView === 'assigned'
      ? requestedView
      : 'all';
  const [profile] = await withUserContext(
    user.id,
    (tx) => tx<{ role: string }[]>`
    select role from public.profiles where id = ${user.id}
  `,
  );
  if (profile?.role !== 'admin') redirect('/staff-portal');
  const allJobs = (await stylistJobsForAdmin())
    .filter((job) => job.status === 'active')
    .sort(compareJobsByBookingDate);
  const awaiting = allJobs.reduce(
    (sum, job) =>
      sum +
      job.stylistInterests.filter(
        (interest) => interest.status === 'interested',
      ).length,
    0,
  );
  const assigned = allJobs.reduce(
    (sum, job) =>
      sum +
      job.stylistInterests.filter((interest) => interest.status === 'approved')
        .length,
    0,
  );
  const jobs = allJobs.filter((job) =>
    view === 'awaiting'
      ? job.stylistInterests.some((interest) => interest.status === 'interested')
      : view === 'assigned'
        ? job.stylistInterests.some((interest) => interest.status === 'approved')
        : true,
  );

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1240px] space-y-4">
        <DashboardHeader
          title="Stylist Approvals"
          subtitle="Assign interested stylists to rental events"
          backHref="/dashboard"
        />
        <section className="grid gap-3 md:grid-cols-3">
            <Summary
              icon={<CalendarClock />}
              label="Rental events"
              value={allJobs.length}
              tone="primary"
              href="/stylist-approvals"
              active={view === 'all'}
            />
            <Summary icon={<UsersRound />} label="Awaiting" value={awaiting} tone="warning" href="/stylist-approvals?view=awaiting" active={view === 'awaiting'} />
            <Summary icon={<UserCheck />} label="Assigned" value={assigned} tone="success" href="/stylist-approvals?view=assigned" active={view === 'assigned'} />
        </section>

        {jobs.length ? (
          <Card className="gap-0 overflow-hidden border-[#e2cfb5] bg-[radial-gradient(circle_at_top_left,#fbf4e9_0%,#f6efe5_38%,#f3ede5_100%)] py-0 shadow-level-1 ring-0 dark:border-[#493822] dark:bg-[radial-gradient(circle_at_top_left,#2d2419_0%,#211c16_55%)]">
            <PaginatedList
              itemLabel="rental events"
              contentClassName="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {jobs.map((job) => (
                <article
                  key={job.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e4d2b6] bg-white shadow-level-1 transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-level-2 dark:border-[#493822] dark:bg-card"
                >
                  <div className="flex flex-1 flex-col p-4">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/event-jobs/${job.id}`}
                          className="min-w-0 truncate text-xs font-semibold text-primary hover:underline"
                        >
                          {job.id}
                        </Link>
                        <Badge
                          variant="outline"
                          className="h-5 border-[#dfc6a4] bg-[#f5ead8] dark:bg-[#33291c] px-1.5 text-[10px] text-[#70481c]"
                        >
                          Rental
                        </Badge>
                      </div>
                      <h2 className="mt-2 truncate text-base font-semibold">
                        {job.eventSummary.customerName || 'Customer not added'}
                      </h2>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {job.eventSummary.eventName} · {job.bookingNumber}
                      </p>
                      <div className="mt-3 grid gap-1.5 rounded-lg bg-[#fcfaf7] px-3 py-2.5 text-xs text-muted-foreground dark:bg-[#241e17]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CalendarClock className="size-3.5" />
                          {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                          {friendlyTime(job.eventSummary.eventTime)}
                        </span>
                        {job.eventSummary.venue ? (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="truncate">{job.eventSummary.venue}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <form
                      action={setStylistsRequiredAction}
                      className="mt-3 flex items-end gap-2"
                    >
                      <input type="hidden" name="jobId" value={job.id} />
                      <label className="flex-1 text-[11px] font-medium text-muted-foreground">
                        Stylists required
                        <input
                          name="count"
                          type="number"
                          min={0}
                          defaultValue={job.stylistsRequiredCount}
                          className="mt-1 h-8 w-full rounded-lg border border-input bg-white dark:bg-card px-2.5 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                        />
                      </label>
                      <Button type="submit" variant="outline" size="sm">
                        Save
                      </Button>
                    </form>
                  </div>
                  <div className="border-t border-[#eadcc8] bg-[#fffdf9] p-4 dark:border-[#493822] dark:bg-[#1f1a15]">
                    <StylistAssignmentPanel
                      jobId={job.id}
                      requiredCount={job.stylistsRequiredCount}
                      applicants={job.stylistInterests.map((interest) => ({
                        id: interest.id,
                        name: interest.stylistName,
                        status: interest.status,
                      }))}
                    />
                  </div>
                </article>
              ))}
            </PaginatedList>
          </Card>
        ) : (
          <Card className="border-border shadow-level-1">
            <CardContent className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                  <UserCheck />
                </span>
                <h3 className="mt-4 font-semibold">
                  {view === 'awaiting'
                    ? 'No events are awaiting stylist approval'
                    : view === 'assigned'
                      ? 'No events have assigned stylists'
                      : 'No rental events need stylist approval'}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {view === 'all'
                    ? 'Confirmed rental Event Jobs will appear here.'
                    : 'Choose another KPI card to view a different status.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </BookingPortalShell>
  );
}

function Summary({
  icon,
  label,
  value,
  tone,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'warning' | 'success';
  href: string;
  active: boolean;
}) {
  const iconTone = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40'
      : 'border-[#e4d2b6] bg-[#f5ead8] text-primary dark:border-[#493822] dark:bg-[#33291c]';
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[96px] items-center justify-between gap-4 rounded-xl border bg-white px-4 py-4 shadow-level-1 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-level-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-card sm:px-5 ${active ? 'border-primary/50 ring-2 ring-primary/10' : 'border-border'}`}
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <strong className="mt-1 block text-2xl font-semibold tracking-[-0.03em] tabular-nums">{value}</strong>
      </div>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl border [&_svg]:size-4.5 ${iconTone}`}>
        {icon}
      </span>
      <span className="sr-only">Filter stylist approvals by {label}</span>
    </Link>
  );
}
