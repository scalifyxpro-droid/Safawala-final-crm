import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageCheck,
} from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { listJobs } from '@/lib/event-jobs/store';
import { withServiceRole } from '@/lib/db/client';
import { QueueFilterBar } from '@/components/staff-portal/queue-filter-bar';
import {
  compareJobsByBookingDate,
  compareJobsByEventSchedule,
} from '@/lib/event-jobs/sorting';

export const dynamic = 'force-dynamic';

type QueueView = 'open' | 'closed';

export default async function StaffCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [session, params, allJobs] = await Promise.all([
    requireDepartment('collection'),
    searchParams,
    listJobs(),
  ]);
  const { view: requestedView, q = '', sort = 'booking', eventDate = '', bookingDate = '' } = params as typeof params & { q?: string; sort?: string; eventDate?: string; bookingDate?: string };
  const view: QueueView = requestedView === 'closed' ? 'closed' : 'open';
  const rentalJobs = allJobs.filter((job) => job.bookingType === 'rental');
  const collectionIsOpen = (job: (typeof rentalJobs)[number]) =>
    job.stages.some(
      (stage) =>
        stage.key === 'collection' &&
        (stage.status === 'open' || stage.status === 'in_progress'),
    );
  const openJobs = rentalJobs.filter(
    (job) => job.status === 'active' && collectionIsOpen(job),
  );
  const closedJobs = rentalJobs.filter((job) => Boolean(job.collectionCheck));
  const jobs = (view === 'open' ? openJobs : closedJobs).filter((job) => (!q || `${job.eventSummary.customerName ?? ''} ${job.bookingNumber} ${job.eventSummary.eventName}`.toLowerCase().includes(q.toLowerCase())) && (!eventDate || job.eventSummary.eventDate === eventDate) && (!bookingDate || job.createdAt.slice(0, 10) === bookingDate)).sort(sort === 'booking' ? compareJobsByBookingDate : compareJobsByEventSchedule);
  const groupedJobs = Array.from(
    jobs.reduce((groups, job) => {
      const key = sort === 'event' ? (job.eventSummary.eventDate || 'unscheduled') : (job.createdAt.slice(0, 10) || 'unscheduled');
      const group = groups.get(key) ?? [];
      group.push(job);
      groups.set(key, group);
      return groups;
    }, new Map<string, typeof jobs>()),
  ).sort(([firstDate], [secondDate]) => (firstDate === 'unscheduled' ? '9999-12-31' : firstDate).localeCompare(secondDate === 'unscheduled' ? '9999-12-31' : secondDate));

  const bookingIds = rentalJobs.map((job) => job.bookingId);
  const bookings = bookingIds.length
    ? await withServiceRole((tx) =>
        tx.unsafe(
          `select b.id, case when c.id is null then null else json_build_object('name', c.name) end as customers
           from public.bookings b
           left join public.customers c on c.id = b.customer_id
           where b.id = any($1::bigint[])`,
          [bookingIds],
        ),
      )
    : [];
  const customerByBookingId = new Map(
    (bookings as unknown as { id: number; customers: { name: string } | null }[]).map((booking) => {
      return [Number(booking.id), booking.customers?.name ?? 'Customer'] as const;
    }),
  );

  return (
    <StaffPortalShell
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1180px] space-y-5">
        <QueueFilterBar basePath="/staff-portal/collection" search={q} sort={sort} eventDate={eventDate} bookingDate={bookingDate} />
        <DashboardHeader
          title="Collection"
          subtitle="Collect rental products and hand them over safely"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/staff-portal/collection"
            className={`rounded-xl border p-4 transition ${view === 'open' ? 'border-[#d6b98d] bg-[#f5ead8] text-[#70481c] shadow-sm' : 'bg-white dark:bg-card hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="size-4" /> Open jobs
            </span>
            <strong className="mt-1 block text-2xl">{openJobs.length}</strong>
          </Link>
          <Link
            href="/staff-portal/collection?view=closed"
            className={`rounded-xl border p-4 transition ${view === 'closed' ? 'border-[#d6b98d] bg-[#f5ead8] text-[#70481c] shadow-sm' : 'bg-white dark:bg-card hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4" /> Closed jobs
            </span>
            <strong className="mt-1 block text-2xl">{closedJobs.length}</strong>
          </Link>
        </div>

        <Card className="overflow-hidden border-border shadow-level-1">
          <CardContent className="p-0">
            {jobs.length ? (
              <div>
                {groupedJobs.map(([date, dateJobs]) => (
                  <section key={date}>
                    <div className="flex items-center gap-2 border-b bg-[#fcfaf7] dark:bg-[#241e17] px-4 py-2.5 sm:px-5">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#70481c]">
                        {date === 'unscheduled'
                          ? 'Date not added'
                          : friendlyDate(date)}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {dateJobs.length}{' '}
                        {dateJobs.length === 1 ? 'job' : 'jobs'}
                      </span>
                    </div>
                    <ul className="divide-y divide-border">
                      {dateJobs.map((job) => (
                        <li key={job.id}>
                          <Link
                            href={`/staff-portal/collection/${job.id}`}
                            className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#fcfaf7] dark:hover:bg-[#241e17] sm:px-5"
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#f5ead8] text-[#70481c]">
                              <PackageCheck className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <strong className="truncate text-sm">
                                  {customerByBookingId.get(job.bookingId) ??
                                    'Customer'}
                                </strong>
                                <Badge
                                  variant="outline"
                                  className="border-[#e4d2b6] bg-white dark:bg-card text-[#70481c]"
                                >
                                  {view === 'closed'
                                    ? 'Handed over'
                                    : 'Ready to collect'}
                                </Badge>
                              </span>
                              <span className="mt-1 block truncate text-sm text-muted-foreground">
                                {job.eventSummary.eventName} ·{' '}
                                {job.bookingNumber}
                              </span>
                              <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarDays className="size-3.5" />{' '}
                                {friendlyDate(job.eventSummary.eventDate)}
                                {job.eventSummary.eventTime
                                  ? ` · ${friendlyTime(job.eventSummary.eventTime)}`
                                  : ''}
                              </span>
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#70481c]" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#f5ead8] text-[#70481c]">
                    {view === 'open' ? (
                      <PackageCheck className="size-5" />
                    ) : (
                      <CheckCircle2 className="size-5" />
                    )}
                  </span>
                  <h3 className="mt-3 font-semibold">
                    No {view} collection jobs
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {view === 'open'
                      ? 'Rental jobs appear here when collection is ready.'
                      : 'Completed collections and slips appear here.'}
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
