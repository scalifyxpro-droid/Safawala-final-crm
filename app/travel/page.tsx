import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  PlaneTakeoff,
  UserRound,
} from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PaginatedList } from '@/components/ui/paginated-list';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { listJobs } from '@/lib/event-jobs/store';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function TravelPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const rows = (await listJobs())
    .filter((job) => job.status === 'active' && job.bookingType === 'rental')
    .flatMap((job) =>
      job.stylistInterests
        .filter((interest) => interest.status === 'approved')
        .map((interest) => ({
          job,
          interest,
          plan: job.travelPlans.find(
            (entry) => entry.interestId === interest.id,
          ),
        })),
    )
    .sort((a, b) =>
      a.job.eventSummary.eventDate.localeCompare(b.job.eventSummary.eventDate),
    );
  const sentCount = rows.filter(({ plan }) => plan?.ticketConfirmedAt).length;

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1240px] space-y-4">
        <DashboardHeader
          title="Travel Manager"
          subtitle="Confirm tickets for staff selected for rental events"
          backHref="/dashboard"
        />

        <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
          <CardContent className="grid divide-y p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Metric
              icon={<UserRound />}
              label="Selected staff"
              value={rows.length}
            />
            <Metric
              icon={<CheckCircle2 />}
              label="Tickets sent"
              value={sentCount}
            />
            <Metric
              icon={<Clock3 />}
              label="Pending"
              value={rows.length - sentCount}
            />
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
          <CardContent className="p-0">
            {rows.length ? (
              <div className="divide-y divide-border">
                <PaginatedList itemLabel="travel assignments">
                  {rows.map(({ job, interest, plan }) => {
                    const sent = Boolean(plan?.ticketConfirmedAt);
                    return (
                      <div
                        key={`${job.id}-${interest.id}`}
                        className="group px-4 py-3.5 sm:px-5"
                      >
                        <div className="grid gap-3 md:grid-cols-[minmax(190px,.8fr)_minmax(0,1.25fr)_auto] md:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#f5ead8] dark:bg-[#33291c] text-sm font-semibold text-primary">
                              {interest.stylistName.slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {interest.stylistName}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {job.id}
                              </p>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {job.eventSummary.customerName ||
                                'Customer not added'}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {job.eventSummary.eventName} · {job.bookingNumber}
                            </p>
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
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
                          <div className="flex items-center justify-between gap-3 md:justify-end">
                            <Badge
                              variant="outline"
                              className={
                                sent
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                              }
                            >
                              {sent ? <CheckCircle2 /> : <Clock3 />}
                              {sent ? 'Ticket sent' : 'Pending'}
                            </Badge>
                            <Button
                              variant={sent ? 'outline' : 'default'}
                              size="sm"
                              render={
                                <Link
                                  href={`/travel/${job.id}/${interest.id}`}
                                />
                              }
                            >
                              {sent ? 'View' : 'Confirm ticket'}
                              <ArrowRight />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </PaginatedList>
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                    <PlaneTakeoff />
                  </span>
                  <h3 className="mt-4 font-semibold">
                    No staff awaiting travel
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select a stylist for a rental event to create a travel
                    entry.
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    size="sm"
                    render={<Link href="/stylist-approvals" />}
                  >
                    <MessageCircle /> Open Stylist Approvals
                  </Button>
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
