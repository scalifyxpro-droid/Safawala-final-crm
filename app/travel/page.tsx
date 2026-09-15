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

        <section className="grid gap-3 sm:grid-cols-3">
          <Summary
            icon={<UserRound />}
            label="Selected staff"
            value={rows.length}
            tone="primary"
          />
          <Summary
            icon={<CheckCircle2 />}
            label="Tickets sent"
            value={sentCount}
            tone="success"
          />
          <Summary
            icon={<Clock3 />}
            label="Pending"
            value={rows.length - sentCount}
            tone="warning"
          />
        </section>

        {rows.length ? (
          <Card className="gap-0 overflow-hidden border-[#e2cfb5] bg-[radial-gradient(circle_at_top_left,#fbf4e9_0%,#f6efe5_38%,#f3ede5_100%)] py-0 shadow-level-1 ring-0 dark:border-[#493822] dark:bg-[radial-gradient(circle_at_top_left,#2d2419_0%,#211c16_55%)]">
                <PaginatedList
                  itemLabel="travel assignments"
                  contentClassName="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  {rows.map(({ job, interest, plan }) => {
                    const sent = Boolean(plan?.ticketConfirmedAt);
                    return (
                      <article
                        key={`${job.id}-${interest.id}`}
                        className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e4d2b6] bg-white shadow-level-1 transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-level-2 dark:border-[#493822] dark:bg-card"
                      >
                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e4d2b6] bg-[#f5ead8] text-sm font-semibold text-primary dark:border-[#493822] dark:bg-[#33291c]">
                                {interest.stylistName.slice(0, 1).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold">
                                  {interest.stylistName}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                  Selected staff
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                sent
                                  ? 'shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'shrink-0 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                              }
                            >
                              {sent ? <CheckCircle2 /> : <Clock3 />}
                              {sent ? 'Ticket sent' : 'Pending'}
                            </Badge>
                          </div>

                          <div className="mt-4 min-w-0 border-t border-[#eadcc8] pt-3 dark:border-[#493822]">
                            <Link
                              href={`/event-jobs/${job.id}`}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              {job.id}
                            </Link>
                            <h2 className="mt-1.5 truncate text-sm font-semibold">
                              {job.eventSummary.customerName ||
                                'Customer not added'}
                            </h2>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {job.eventSummary.eventName} · {job.bookingNumber}
                            </p>
                          </div>

                          <div className="mt-3 grid gap-1.5 rounded-lg bg-[#fcfaf7] px-3 py-2.5 text-xs text-muted-foreground dark:bg-[#241e17]">
                              <span className="flex items-center gap-1.5">
                                <CalendarClock className="size-3.5 shrink-0" />
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

                          <div className="mt-auto pt-4">
                            <Button
                              className="w-full justify-between"
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
                      </article>
                    );
                  })}
                </PaginatedList>
          </Card>
        ) : (
          <Card className="border-border shadow-level-1">
            <CardContent className="p-0">
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'warning' | 'success';
}) {
  const iconTone = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
      : 'border-[#e4d2b6] bg-[#f5ead8] text-primary dark:border-[#493822] dark:bg-[#33291c]';

  return (
    <div className="flex min-h-[96px] items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-4 shadow-level-1 dark:bg-card sm:px-5">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <strong className="mt-1 block text-2xl font-semibold tracking-[-0.03em] tabular-nums">
          {value}
        </strong>
      </div>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl border [&_svg]:size-4.5 ${iconTone}`}>
        {icon}
      </span>
    </div>
  );
}
