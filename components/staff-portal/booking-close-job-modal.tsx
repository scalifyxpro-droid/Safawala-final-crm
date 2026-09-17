import Link from 'next/link';
import { X } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { getJob } from '@/lib/event-jobs/store';
import { BookingCloseJobContent } from '@/components/staff-portal/booking-close-job-content';

export async function BookingCloseJobModal({ jobId }: { jobId: string }) {
  const [session, job] = await Promise.all([requireDepartment('booking'), getJob(jobId)]);
  if (!session.isMainId || !job) return null;
  const finalStage = job.stages.find((stage) => stage.key === 'booking_final_check');
  if (!finalStage || (finalStage.status !== 'open' && finalStage.status !== 'in_progress' && job.status !== 'closed')) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="booking-close-job-title">
      <div className="flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#dfd3c3] bg-[#fcfaf7] shadow-2xl dark:bg-[#241e17]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-white px-5 py-4 dark:bg-card sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#70481c] dark:text-[#e6c99d]">{job.id} · {job.bookingNumber}</p>
            <h2 id="booking-close-job-title" className="mt-1 truncate text-xl font-semibold tracking-tight">{job.eventSummary.customerName || 'Final booking check'}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{job.eventSummary.eventName}</p>
          </div>
          <Link href="/staff-portal/booking/close-jobs" aria-label="Close job details" className="rounded-full p-2 text-muted-foreground transition hover:bg-[#f5ead8] hover:text-[#70481c]">
            <X className="size-5" />
          </Link>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <BookingCloseJobContent job={job} />
        </div>
      </div>
    </div>
  );
}
