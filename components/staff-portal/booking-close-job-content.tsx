import { CalendarClock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { buildJobOverview, canCloseEventJob } from '@/lib/event-jobs/store';
import type { EventJob } from '@/lib/event-jobs/types';
import { CloseEventForm } from '@/components/staff-portal/close-event-form';

const OPERATIONS_LABELS = new Set(['Warehouse', 'QC & Packing', 'Stylist', 'Travel', 'Collection', 'Return QC', 'Return Warehouse']);

const TONE_CLASS: Record<string, string> = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  attention: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-stone-200 bg-stone-50 text-stone-600',
};

export function BookingCloseJobContent({ job }: { job: EventJob }) {
  const operationsRows = buildJobOverview(job).filter((row) => OPERATIONS_LABELS.has(row.label));
  const canClose = canCloseEventJob(job);
  const missingItems = (job.collectionCheck?.items ?? []).filter(
    (item) => item.sentQuantity - (item.returnedQuantity ?? 0) > 0,
  );
  const damagedItems = (job.returnQualityCheck?.items ?? []).filter(
    (item) => (item.damagedQuantity ?? 0) > 0,
  );

  return (
    <div className="space-y-4">
      {job.status === 'closed' ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 text-sm text-emerald-800">
            This Event Job is Completed / Closed
            {job.bookingFinalCheck ? (
              <> — closed by {job.bookingFinalCheck.completedBy} on {friendlyDate(job.bookingFinalCheck.completedAt)}.</>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border shadow-level-1">
        <CardHeader><CardTitle>Event details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" /> {friendlyDate(job.eventSummary.eventDate)} · {friendlyTime(job.eventSummary.eventTime)}
          </p>
          {job.eventSummary.venue ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> {job.eventSummary.venue}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border shadow-level-1">
        <CardHeader><CardTitle>Operations</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {operationsRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <span>{row.label}</span>
              <Badge variant="outline" className={TONE_CLASS[row.tone]}>{row.value}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border shadow-level-1">
        <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
        <CardContent>
          {job.paymentSummary ? (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>Total amount: <span className="font-medium">₹{job.paymentSummary.totalAmount.toLocaleString('en-IN')}</span></p>
              <p>Amount received: <span className="font-medium">₹{job.paymentSummary.amountReceived.toLocaleString('en-IN')}</span></p>
              <p>Pending balance: <span className="font-medium">₹{job.paymentSummary.pendingBalance.toLocaleString('en-IN')}</span></p>
              <p>Deposit: <span className="font-medium">₹{job.paymentSummary.depositAmount.toLocaleString('en-IN')}</span></p>
              <p className="sm:col-span-2">Existing payment status: <span className="font-medium capitalize">{job.paymentSummary.paymentStatus}</span></p>
              {job.bookingFinalCheck ? (
                <>
                  <p>Additional payment collected: <span className="font-medium">₹{job.bookingFinalCheck.additionalPaymentAmount.toLocaleString('en-IN')}</span></p>
                  <p>Refund issued: <span className="font-medium">₹{job.bookingFinalCheck.refundAmount.toLocaleString('en-IN')}</span></p>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Payment details are not available for this job.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-level-1">
        <CardHeader><CardTitle>Damage / Missing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Missing (from Collection)</p>
            {missingItems.length ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {missingItems.map((item, index) => (
                  <li key={index}>{item.itemName}: {item.sentQuantity - (item.returnedQuantity ?? 0)} missing</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing missing.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Damaged (from Return QC)</p>
            {damagedItems.length ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {damagedItems.map((item, index) => (
                  <li key={index}>{item.itemName}: {item.damagedQuantity} damaged</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing damaged.</p>}
          </div>
        </CardContent>
      </Card>

      {job.status === 'closed' ? null : (
        <CloseEventForm
          jobId={job.id}
          canClose={canClose}
          pendingBalance={Math.max(job.paymentSummary?.pendingBalance ?? 0, 0)}
          depositAmount={Math.max(job.paymentSummary?.depositAmount ?? 0, 0)}
        />
      )}
    </div>
  );
}
