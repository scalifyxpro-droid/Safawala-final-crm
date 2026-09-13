import Link from 'next/link';
import {
  X,
  CalendarClock,
  MapPin,
  PackageCheck,
  UsersRound,
} from 'lucide-react';
import { requireStylistSession } from '@/lib/staff-portal/guard';
import { stylistJobForAccount } from '@/lib/event-jobs/store';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { Badge } from '@/components/ui/badge';
import {
  StylistInterestButton,
  WithdrawInterestButton,
} from '@/components/staff-portal/stylist-interest-button';

export async function StylistJobModal({ jobId }: { jobId: string }) {
  const session = await requireStylistSession();
  const job = await stylistJobForAccount(jobId, session.id, session.isMainId);
  if (!job) return null;
  const interest = job.stylistInterests.find(
    (item) => item.stylistAccountId === session.id,
  );
  const interested = job.stylistInterests.filter(
    (item) => item.status === 'interested',
  ).length;
  const quantity = job.requiredItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Stylist event details"
    >
      <div className="w-full max-w-[680px] overflow-hidden rounded-2xl border border-[#dfd3c3] bg-[#fcfaf7] dark:bg-[#241e17] shadow-2xl">
        <div className="flex items-start justify-between border-b bg-white dark:bg-card px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#70481c]">
              Rental event · {job.bookingNumber}
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {job.eventSummary.customerName || 'Customer not added'}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {job.eventSummary.eventName}
            </p>
          </div>
          <Link
            href="/staff-portal/stylist"
            aria-label="Close event details"
            className="rounded-full p-2 text-muted-foreground hover:bg-[#f5ead8] hover:text-[#70481c]"
          >
            <X className="size-5" />
          </Link>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3 rounded-xl border bg-white dark:bg-card p-4">
              <UsersRound className="mt-0.5 size-4 text-[#9a6a2f]" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="mt-1 truncate font-medium">
                  {job.eventSummary.customerName || 'Customer not added'}
                </p>
                {job.eventSummary.customerPhone ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {job.eventSummary.customerPhone}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border bg-white dark:bg-card p-4">
              <CalendarClock className="mt-0.5 size-4 text-[#9a6a2f]" />
              <div>
                <p className="text-xs text-muted-foreground">Date and time</p>
                <p className="mt-1 font-medium">
                  {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                  {friendlyTime(job.eventSummary.eventTime)}
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border bg-white dark:bg-card p-4">
              <MapPin className="mt-0.5 size-4 text-[#9a6a2f]" />
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="mt-1 font-medium">
                  {job.eventSummary.venue || 'Venue to be confirmed'}
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border bg-white dark:bg-card p-4">
              <PackageCheck className="mt-0.5 size-4 text-[#9a6a2f]" />
              <div>
                <p className="text-xs text-muted-foreground">Rental quantity</p>
                <p className="mt-1 font-medium">{quantity} items</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border bg-white dark:bg-card p-4">
              <UsersRound className="mt-0.5 size-4 text-[#9a6a2f]" />
              <div>
                <p className="text-xs text-muted-foreground">
                  Stylist requirement
                </p>
                <p className="mt-1 font-medium">
                  {job.stylistsRequiredCount} required · {interested} interested
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[#e4d2b6] bg-[#fffaf2] p-4">
            <div>
              <p className="font-semibold">
                {session.isMainId
                  ? 'Stylist assignment overview'
                  : interest
                    ? 'Your response'
                    : 'Available for this event?'}
              </p>
              {session.isMainId ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {
                    job.stylistInterests.filter(
                      (item) => item.status === 'approved',
                    ).length
                  }{' '}
                  approved of {job.stylistsRequiredCount} required ·{' '}
                  {interested} interested
                </p>
              ) : interest ? (
                <Badge
                  variant="outline"
                  className="mt-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  {interest.status === 'approved'
                    ? 'Assigned'
                    : interest.status === 'interested'
                      ? 'Under review'
                      : 'Not selected'}
                </Badge>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Submit once for admin review.
                </p>
              )}
            </div>
            {interest?.status === 'interested' ? (
              <WithdrawInterestButton jobId={job.id} />
            ) : !interest ? (
              <StylistInterestButton jobId={job.id} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
