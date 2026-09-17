import Link from 'next/link';
import {
  Boxes,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { listJobs } from '@/lib/event-jobs/store';
import { withServiceRole } from '@/lib/db/client';
import { WarehouseJobModal } from '@/components/staff-portal/warehouse-job-modal';
import { QueueFilterBar } from '@/components/staff-portal/queue-filter-bar';
import { DepartmentJobCardGrid } from '@/components/staff-portal/department-job-card-grid';
import {
  compareJobsByBookingDate,
  compareJobsByEventSchedule,
} from '@/lib/event-jobs/sorting';

export const dynamic = 'force-dynamic';

type QueueView = 'open' | 'closed';

export default async function StaffWarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string; view?: string; job?: string }>;
}) {
  const [session, params, allJobs] = await Promise.all([
    requireDepartment('warehouse'),
    searchParams,
    listJobs(),
  ]);
  const { completed, view: requestedView, job: selectedJobId, q = '', sort = 'booking', eventDate = '', bookingDate = '' } = params as typeof params & { q?: string; sort?: string; eventDate?: string; bookingDate?: string };
  const view: QueueView = requestedView === 'closed' ? 'closed' : 'open';
  const departmentJobs = allJobs;
  const hasOpenWarehouseStage = (job: (typeof departmentJobs)[number]) =>
    job.stages.some(
      (stage) =>
        (stage.key === 'warehouse_pick' || stage.key === 'return_warehouse') &&
        (stage.status === 'open' || stage.status === 'in_progress'),
    );
  const openJobs = departmentJobs.filter(
    (job) => job.status === 'active' && hasOpenWarehouseStage(job),
  );
  const closedJobs = departmentJobs.filter(
    (job) =>
      !hasOpenWarehouseStage(job) &&
      Boolean(job.warehousePrep || job.returnWarehouseCheck),
  );
  const jobs = (view === 'open' ? openJobs : closedJobs).filter((job) => (!q || `${job.eventSummary.customerName ?? ''} ${job.bookingNumber} ${job.eventSummary.eventName} ${job.eventSummary.venue ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (!eventDate || job.eventSummary.eventDate === eventDate) && (!bookingDate || job.createdAt.slice(0, 10) === bookingDate)).sort(sort === 'booking' ? compareJobsByBookingDate : compareJobsByEventSchedule);
  const bookingIds = departmentJobs.map((job) => job.bookingId);
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
  const jobCards = jobs.map((job) => {
    const returnStage = job.stages.find((stage) => stage.key === 'return_warehouse');
    const isReturn = Boolean(returnStage && ['open', 'in_progress'].includes(returnStage.status));
    const warehousePickStage = job.stages.find((stage) => stage.key === 'warehouse_pick');
    const hasRejection = !isReturn && warehousePickStage?.status !== 'done' &&
      (job.qualityCheck?.items ?? []).some((item) => (item.goodQuantity ?? 0) < (item.checkedQuantity ?? 0));
    return {
      id: job.id,
      href: `/staff-portal/warehouse?view=${view}&job=${encodeURIComponent(job.id)}`,
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
      departmentStatus: isReturn ? 'Return receiving' : hasRejection ? 'Repick needed' : view === 'closed' ? 'Warehouse completed' : 'Picking',
      departmentComplete: view === 'closed' && !hasRejection,
      jobComplete: job.status === 'closed',
    };
  });

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
          title="Warehouse"
          subtitle="Pick order items and send completed jobs to QC & Packing"
        />

        {completed ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="size-4" /> {completed} was completed and
            sent to QC &amp; Packing.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/staff-portal/warehouse"
            className={`rounded-xl border p-4 transition ${view === 'open' ? 'border-[#d6b98d] bg-[#f5ead8] text-[#70481c] shadow-sm' : 'bg-white dark:bg-card hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="size-4" /> Open jobs
            </span>
            <strong className="mt-1 block text-2xl">{openJobs.length}</strong>
          </Link>
          <Link
            href="/staff-portal/warehouse?view=closed"
            className={`rounded-xl border p-4 transition ${view === 'closed' ? 'border-[#d6b98d] bg-[#f5ead8] text-[#70481c] shadow-sm' : 'bg-white dark:bg-card hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4" /> Closed jobs
            </span>
            <strong className="mt-1 block text-2xl">{closedJobs.length}</strong>
          </Link>
        </div>

        <QueueFilterBar basePath="/staff-portal/warehouse" search={q} sort={sort} eventDate={eventDate} bookingDate={bookingDate} view={view} />

        {jobs.length ? (
          <DepartmentJobCardGrid items={jobCards} />
        ) : (
          <Card className="overflow-hidden border-border shadow-level-1">
            <CardContent className="p-0">
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#f5ead8] text-[#70481c]">
                    {view === 'open' ? (
                      <Boxes className="size-5" />
                    ) : (
                      <CheckCircle2 className="size-5" />
                    )}
                  </span>
                  <h3 className="mt-3 font-semibold">
                    No {view} warehouse jobs
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {view === 'open'
                      ? 'Confirmed sale and rental jobs will appear here for picking.'
                      : 'Completed picking jobs will appear here.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {selectedJobId ? (
        <WarehouseJobModal jobId={selectedJobId} view={view} />
      ) : null}
    </StaffPortalShell>
  );
}
