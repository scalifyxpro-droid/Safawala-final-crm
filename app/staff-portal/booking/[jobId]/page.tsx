import { notFound, redirect } from 'next/navigation';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { BookingCloseJobContent } from '@/components/staff-portal/booking-close-job-content';
import { getJob } from '@/lib/event-jobs/store';

export const dynamic = 'force-dynamic';

export default async function BookingJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const [session, job] = await Promise.all([requireDepartment('booking'), getJob(jobId)]);
  if (!session.isMainId) redirect('/staff-portal');
  if (!job) notFound();

  const stage = job.stages.find((item) => item.key === 'booking_final_check');
  if (!stage) notFound();
  const isRelevant = stage.status === 'open' || stage.status === 'in_progress' || job.status === 'closed';
  if (!isRelevant) redirect('/staff-portal/booking');

  return (
    <StaffPortalShell language={session.languagePreference} name={session.name} departments={session.departments} permissions={session.permissions} isMainId={session.isMainId}>
      <div className="mx-auto max-w-[900px] space-y-6">
        <DashboardHeader title={job.id} subtitle={`${job.eventSummary.eventName} · ${job.bookingNumber}`} backHref="/staff-portal/booking/close-jobs" />
        <BookingCloseJobContent job={job} />
      </div>
    </StaffPortalShell>
  );
}
