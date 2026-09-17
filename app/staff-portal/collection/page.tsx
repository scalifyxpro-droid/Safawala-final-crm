import Link from 'next/link';
import {
  CheckCircle2,
  Clock3,
  PackageCheck,
} from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { listJobs } from '@/lib/event-jobs/store';
import { withServiceRole } from '@/lib/db/client';
import { QueueFilterBar } from '@/components/staff-portal/queue-filter-bar';
import { DepartmentJobCardGrid } from '@/components/staff-portal/department-job-card-grid';
import { compareJobsByBookingDate } from '@/lib/event-jobs/sorting';
import { CollectionJobModal } from '@/components/staff-portal/collection-job-modal';

export const dynamic = 'force-dynamic';

type QueueView = 'open' | 'closed';

export default async function StaffCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; job?: string }>;
}) {
  const [session, params, allJobs] = await Promise.all([
    requireDepartment('collection'),
    searchParams,
    listJobs(),
  ]);
  const { view: requestedView, job: selectedJobId, q = '' } = params as typeof params & { q?: string };
  const view: QueueView = requestedView === 'closed' ? 'closed' : 'open';
  const rentalJobs = allJobs.filter((job) => job.bookingType === 'rental');
  const collectionIsOpen = (job: (typeof rentalJobs)[number]) =>
    job.stages.some(
      (stage) =>
        stage.key === 'collection' &&
        (stage.status === 'open' || stage.status === 'in_progress'),
    );
  const openJobs = rentalJobs.filter(
    (job) => job.status === 'active' && collectionIsOpen(job) && job.stylistExecutions.some((entry) => entry.status === 'work_completed'),
  );
  const closedJobs = rentalJobs.filter((job) => Boolean(job.collectionCheck));
  const jobs = (view === 'open' ? openJobs : closedJobs)
    .filter((job) => !q || `${job.eventSummary.customerName ?? ''} ${job.bookingNumber} ${job.eventSummary.eventName}`.toLowerCase().includes(q.toLowerCase()))
    .sort(compareJobsByBookingDate);
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
  const jobCards = jobs.map((job) => ({
    id: job.id,
    href: `/staff-portal/collection?view=${view}&job=${encodeURIComponent(job.id)}`,
    jobNumber: job.id,
    bookingType: job.bookingType,
    customerName: customerByBookingId.get(job.bookingId) ?? job.eventSummary.customerName ?? 'Customer',
    eventName: job.eventSummary.eventName,
    bookingNumber: job.bookingNumber,
    bookingDate: friendlyDate(job.createdAt.slice(0, 10)),
    eventDate: friendlyDate(job.eventSummary.eventDate),
    eventTime: job.eventSummary.eventTime ? friendlyTime(job.eventSummary.eventTime) : null,
    venue: job.eventSummary.venue,
    itemCount: job.requiredItems.length,
    departmentStatus: view === 'closed' ? 'Collection completed' : 'Ready to collect',
    departmentComplete: view === 'closed',
    jobComplete: job.status === 'closed',
  }));

  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1180px] space-y-5">
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

        <QueueFilterBar basePath="/staff-portal/collection" search={q} view={view} />

        {jobs.length ? (
          <DepartmentJobCardGrid items={jobCards} clickableCards />
        ) : (
          <Card className="overflow-hidden border-border shadow-level-1">
            <CardContent className="p-0">
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
            </CardContent>
          </Card>
        )}
      </div>
      {selectedJobId ? <CollectionJobModal jobId={selectedJobId} view={view} /> : null}
    </StaffPortalShell>
  );
}
