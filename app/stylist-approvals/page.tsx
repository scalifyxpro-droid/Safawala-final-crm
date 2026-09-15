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

export const dynamic = 'force-dynamic';

export default async function StylistApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const [profile] = await withUserContext(
    user.id,
    (tx) => tx<{ role: string }[]>`
    select role from public.profiles where id = ${user.id}
  `,
  );
  if (profile?.role !== 'admin') redirect('/staff-portal');
  const jobs = (await stylistJobsForAdmin())
    .filter((job) => job.status === 'active')
    .sort((a, b) =>
      a.eventSummary.eventDate.localeCompare(b.eventSummary.eventDate),
    );
  const awaiting = jobs.reduce(
    (sum, job) =>
      sum +
      job.stylistInterests.filter(
        (interest) => interest.status === 'interested',
      ).length,
    0,
  );
  const assigned = jobs.reduce(
    (sum, job) =>
      sum +
      job.stylistInterests.filter((interest) => interest.status === 'approved')
        .length,
    0,
  );

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1240px] space-y-4">
        <DashboardHeader
          title="Stylist Approvals"
          subtitle="Assign interested stylists to rental events"
          backHref="/dashboard"
        />
        <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
          <CardContent className="grid divide-y p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Summary
              icon={<CalendarClock />}
              label="Rental events"
              value={jobs.length}
            />
            <Summary icon={<UsersRound />} label="Awaiting" value={awaiting} />
            <Summary icon={<UserCheck />} label="Assigned" value={assigned} />
          </CardContent>
        </Card>

        {jobs.length ? (
          <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
            <PaginatedList itemLabel="rental events">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="border-b border-border p-4 last:border-b-0 sm:p-5"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/event-jobs/${job.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
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
                      <h2 className="mt-1 text-base font-semibold">
                        {job.eventSummary.customerName || 'Customer not added'}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {job.eventSummary.eventName} · {job.bookingNumber}
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarClock className="size-3.5" />
                          {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                          {friendlyTime(job.eventSummary.eventTime)}
                        </span>
                        {job.eventSummary.venue ? (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5" />
                            {job.eventSummary.venue}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <form
                      action={setStylistsRequiredAction}
                      className="flex w-full items-end gap-2 lg:w-auto"
                    >
                      <input type="hidden" name="jobId" value={job.id} />
                      <label className="flex-1 text-[11px] font-medium text-muted-foreground lg:w-28">
                        Required
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
                  <div className="mt-4 border-t border-border pt-3">
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
                </div>
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
                  No rental events need stylist approval
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirmed rental Event Jobs will appear here.
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-8 place-items-center rounded-lg bg-[#f5ead8] dark:bg-[#33291c] text-primary [&_svg]:size-4">
        {icon}
      </span>
      <div className="flex items-baseline gap-2">
        <strong className="text-lg tabular-nums">{value}</strong>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
