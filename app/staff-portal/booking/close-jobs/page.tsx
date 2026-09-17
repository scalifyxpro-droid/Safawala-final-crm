import { redirect } from 'next/navigation';
import { CircleCheckBig } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, friendlyTime, money } from '@/lib/bookings';
import { listActiveJobs } from '@/lib/event-jobs/store';
import { compareJobsByBookingDate } from '@/lib/event-jobs/sorting';
import { withUserContext } from '@/lib/db/client';
import { DepartmentJobCardGrid } from '@/components/staff-portal/department-job-card-grid';
import { BookingCloseJobModal } from '@/components/staff-portal/booking-close-job-modal';

export const dynamic = 'force-dynamic';

export default async function CloseJobsPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const [session, { job: selectedJobId }] = await Promise.all([requireDepartment('booking'), searchParams]);
  if (!session.isMainId) redirect('/staff-portal');

  const jobs = (await listActiveJobs()).filter((job) => {
    const finalStage = job.stages.find((stage) => stage.key === 'booking_final_check');
    return finalStage?.status === 'open' || finalStage?.status === 'in_progress';
  }).sort(compareJobsByBookingDate);
  const bookingIds = jobs.map((job) => job.bookingId);
  const bookings = bookingIds.length
    ? await withUserContext(session.id, (tx) =>
        tx.unsafe(
          `select b.id, case when c.id is null then null else json_build_object('name', c.name) end as customers
           from public.bookings b
           left join public.customers c on c.id = b.customer_id
           where b.id = any($1::bigint[])`,
          [bookingIds],
        ),
      )
    : [];
  const customerByBooking = new Map(
    (bookings as unknown as { id: number; customers: { name: string } | null }[]).map((booking) => [
      Number(booking.id),
      booking.customers?.name ?? 'Customer',
    ]),
  );
  const jobCards = jobs.map((job) => {
    const pending = Math.max(job.paymentSummary?.pendingBalance ?? 0, 0);
    return {
      id: job.id,
      href: `/staff-portal/booking/close-jobs?job=${encodeURIComponent(job.id)}`,
      jobNumber: job.id,
      bookingType: job.bookingType,
      customerName: customerByBooking.get(job.bookingId) ?? job.eventSummary.customerName ?? 'Customer',
      eventName: job.eventSummary.eventName,
      bookingNumber: job.bookingNumber,
      bookingDate: friendlyDate(job.createdAt.slice(0, 10)),
      bookingDateKey: job.createdAt.slice(0, 10),
      eventDate: friendlyDate(job.eventSummary.eventDate),
      eventTime: job.eventSummary.eventTime ? friendlyTime(job.eventSummary.eventTime) : null,
      venue: job.eventSummary.venue,
      itemCount: job.requiredItems.length,
      departmentStatus: pending > 0 ? `${money(pending)} pending` : 'Fully paid',
      departmentComplete: pending <= 0,
      jobComplete: false,
      jobStatusLabel: 'Final check',
    };
  });

  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1180px] space-y-5">
        <DashboardHeader
          title="Close Jobs"
          subtitle="Check the final payment and close completed rental jobs"
        />

        {jobs.length ? (
          <DepartmentJobCardGrid items={jobCards} groupByBookingDate clickableCards />
        ) : (
          <Card className="border-border shadow-level-1">
            <CardContent className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                  <CircleCheckBig />
                </span>
                <h2 className="mt-4 font-semibold">No jobs are waiting</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A job appears here after Return Warehouse is completed.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {selectedJobId ? <BookingCloseJobModal jobId={selectedJobId} /> : null}
    </StaffPortalShell>
  );
}
