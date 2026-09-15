import Link from 'next/link';
import { X, CalendarDays, MapPin, UserRound, PackageCheck } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { Badge } from '@/components/ui/badge';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { getJob } from '@/lib/event-jobs/store';
import { JobTracker } from '@/components/staff-portal/job-tracker';
import { QualityCheckForm } from '@/components/staff-portal/quality-check-form';
import { PackingChecklistForm } from '@/components/staff-portal/packing-checklist-form';
import { PackingSlipButton } from '@/components/staff-portal/packing-slip-button';
import { ReturnQualityCheckForm } from '@/components/staff-portal/return-quality-check-form';
import { ReturnQcSlipButton } from '@/components/staff-portal/return-slips';
import { withServiceRole } from '@/lib/db/client';

type Relation<T> = T | T[] | null;
type BookingContext = {
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  contact_name: string | null;
  alternate_mobile: string | null;
  customers: Relation<{ name: string; phone: string }>;
  booking_items: {
    item_name: string;
    quantity: number;
    products: Relation<{ barcode: string | null }>;
  }[];
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function QcJobModal({
  jobId,
  view = 'open',
}: {
  jobId: string;
  view?: 'open' | 'closed';
}) {
  const [session, job] = await Promise.all([
    requireDepartment('qc'),
    getJob(jobId),
  ]);
  if (!job) return null;
  const qcStage = job.stages.find((stage) => stage.key === 'quality_check');
  const packingStage = job.stages.find((stage) => stage.key === 'packing');
  const returnStage = job.stages.find(
    (stage) => stage.key === 'return_quality_check',
  );
  const warehousePickStage = job.stages.find(
    (stage) => stage.key === 'warehouse_pick',
  );
  if (!qcStage || !packingStage || !returnStage) return null;
  const bookingRows = await withServiceRole((tx) =>
    tx.unsafe(
      `select
         b.event_name, b.event_date, b.event_time, b.event_location, b.contact_name, b.alternate_mobile,
         case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers,
         coalesce(items.rows, '[]'::json) as booking_items
       from public.bookings b
       left join public.customers c on c.id = b.customer_id
       left join lateral (
         select json_agg(json_build_object(
           'item_name', bi.item_name,
           'quantity', bi.quantity,
           'products', case when p.id is null then null else json_build_object('barcode', p.barcode) end
         )) as rows
         from public.booking_items bi
         left join public.products p on p.id = bi.product_id
         where bi.booking_id = b.id
       ) items on true
       where b.id = $1
       limit 1`,
      [job.bookingId],
    ),
  );
  const booking = ((bookingRows as unknown as BookingContext[])[0] ??
    null) as BookingContext | null;
  const customer = first(booking?.customers);
  const barcode = new Map<string, string | null>(
    (booking?.booking_items ?? []).map((item) => [
      item.item_name,
      first(item.products)?.barcode ?? null,
    ]),
  );
  const qcItems = (
    job.warehousePrep?.items ??
    job.requiredItems.map((item) => ({
      itemName: item.itemName,
      requiredQuantity: item.quantity,
      preparedQuantity: item.quantity,
    }))
  )
    .filter((item) => (item.preparedQuantity ?? 0) > 0)
    .map((item) => ({
      itemName: item.itemName,
      quantity: item.preparedQuantity ?? 0,
      barcode: barcode.get(item.itemName) ?? null,
    }));
  const packedItems = (job.qualityCheck?.items ?? [])
    .filter((item) => (item.goodQuantity ?? 0) > 0)
    .map((item) => ({
      itemName: item.itemName,
      quantity: item.goodQuantity ?? 0,
      barcode: barcode.get(item.itemName) ?? null,
    }));
  const details = {
    jobId: job.id,
    bookingNumber: job.bookingNumber,
    customerName: customer?.name ?? booking?.contact_name ?? 'Customer',
    customerPhone: booking?.alternate_mobile ?? customer?.phone ?? '',
    eventName: booking?.event_name ?? job.eventSummary.eventName,
    eventDate: booking?.event_date ?? job.eventSummary.eventDate,
    eventTime: booking?.event_time ?? job.eventSummary.eventTime,
    venue: booking?.event_location ?? job.eventSummary.venue,
  };
  const qcOpen = qcStage.status === 'open' || qcStage.status === 'in_progress';
  const packingOpen =
    packingStage.status === 'open' || packingStage.status === 'in_progress';
  const returnOpen =
    returnStage.status === 'open' || returnStage.status === 'in_progress';
  const returnItems = (job.collectionCheck?.items ?? []).map((item) => ({
    itemName: item.itemName,
    returnedQuantity: item.returnedQuantity ?? 0,
  }));
  const qcSentBackToWarehouse =
    Boolean(job.qualityCheck) &&
    qcStage.status === 'not_started' &&
    warehousePickStage?.status !== 'done';
  const qcRejectedItemsCount = (job.qualityCheck?.items ?? []).filter(
    (item) => (item.goodQuantity ?? 0) < (item.checkedQuantity ?? 0),
  ).length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="QC job details"
    >
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[#dfd3c3] bg-[#fcfaf7] dark:bg-[#241e17] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b bg-white dark:bg-card px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#70481c]">
              {job.id} · {job.bookingNumber}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {details.customerName}
            </h2>
          </div>
          <Link
            href={
              view === 'closed'
                ? '/staff-portal/qc?view=closed'
                : '/staff-portal/qc'
            }
            aria-label="Close job details"
            className="rounded-full p-2 text-muted-foreground hover:bg-[#f5ead8] hover:text-[#70481c]"
          >
            <X className="size-5" />
          </Link>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <section className="rounded-xl border border-[#dfd3c3] bg-white dark:bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-[#e4d2b6] bg-[#f5ead8] text-[#70481c]"
              >
                {job.bookingType === 'sale' ? 'Sale' : 'Rental'} QC
              </Badge>
              <span className="text-sm text-muted-foreground">
                {qcItems.length} product{qcItems.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <p className="flex items-start gap-2">
                <UserRound className="mt-0.5 size-4 text-[#9a6a2f]" />
                <span>
                  <strong className="block font-medium">
                    {details.eventName}
                  </strong>
                  <span className="text-muted-foreground">
                    {details.customerPhone || 'No alternate number'}
                  </span>
                </span>
              </p>
              <p className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 size-4 text-[#9a6a2f]" />
                <span>
                  <strong className="block font-medium">
                    {friendlyDate(details.eventDate)}
                  </strong>
                  <span className="text-muted-foreground">
                    {details.eventTime
                      ? friendlyTime(details.eventTime)
                      : 'Time not added'}
                  </span>
                </span>
              </p>
              {details.venue ? (
                <p className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                  <MapPin className="size-4 text-[#9a6a2f]" /> {details.venue}
                </p>
              ) : null}
            </div>
          </section>
          <div className="mt-4">
            <JobTracker stages={job.stages} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border bg-white dark:bg-card p-2">
            <div
              className={`rounded-lg px-3 py-2.5 text-center text-sm font-medium ${qcSentBackToWarehouse ? 'bg-amber-100 text-amber-900' : job.qualityCheck ? 'bg-emerald-50 text-emerald-700' : qcOpen ? 'bg-[#a86f2c] text-white' : 'bg-muted text-muted-foreground'}`}
            >
              {qcSentBackToWarehouse
                ? '↩ Sent to Warehouse'
                : job.qualityCheck
                  ? '✓ QC passed'
                  : 'Quality check'}
            </div>
            <div
              className={`rounded-lg px-3 py-2.5 text-center text-sm font-medium ${job.packingChecklist ? 'bg-emerald-50 text-emerald-700' : packingOpen ? 'bg-[#a86f2c] text-white' : 'bg-muted text-muted-foreground'}`}
            >
              {job.packingChecklist ? '✓ Packed' : 'Packing'}
            </div>
          </div>
          {job.qualityCheck ? (
            qcSentBackToWarehouse ? (
              <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-amber-900">
                    Sent back to Warehouse
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-amber-900"
                  >
                    {qcRejectedItemsCount} flagged
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-amber-800">
                  Checked by {job.qualityCheck.completedBy} on{' '}
                  {friendlyDate(job.qualityCheck.completedAt ?? '')} — flagged
                  for correction, now with Warehouse.
                </p>
              </section>
            ) : (
              <section className="mt-4 rounded-xl border border-emerald-200 bg-white dark:bg-card p-4">
                <h3 className="font-semibold text-emerald-800">
                  Quality check completed
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Completed by {job.qualityCheck.completedBy} on{' '}
                  {friendlyDate(job.qualityCheck.completedAt ?? '')}
                </p>
              </section>
            )
          ) : qcOpen ? (
            <div className="mt-4">
              <QualityCheckForm jobId={job.id} items={qcItems} />
            </div>
          ) : null}
          {job.qualityCheck && !job.packingChecklist && packingOpen ? (
            <div className="mt-4">
              <PackingChecklistForm
                jobId={job.id}
                details={details}
                items={packedItems}
              />
            </div>
          ) : null}
          {job.packingChecklist ? (
            <section className="mt-4 rounded-xl border border-emerald-200 bg-white dark:bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-emerald-800">
                    Packing completed
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Completed by {job.packingChecklist.completedBy} on{' '}
                    {friendlyDate(job.packingChecklist.completedAt ?? '')}
                  </p>
                </div>
                <PackingSlipButton details={details} items={packedItems} />
              </div>
            </section>
          ) : null}
          {job.returnQualityCheck ? (
            <section className="mt-4 rounded-xl border border-emerald-200 bg-white dark:bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-emerald-800">
                    Return QC completed
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Completed by {job.returnQualityCheck.completedBy} and sent
                    to Return Warehouse.
                  </p>
                </div>
                <ReturnQcSlipButton
                  details={{
                    ...details,
                    completedBy:
                      job.returnQualityCheck.completedBy ?? session.name,
                    completedAt:
                      job.returnQualityCheck.completedAt ?? job.updatedAt,
                  }}
                  items={job.returnQualityCheck.items.map((item) => ({
                    itemName: item.itemName,
                    returnedQuantity: item.returnedQuantity,
                    goodQuantity: item.goodQuantity ?? 0,
                    damagedQuantity: item.damagedQuantity ?? 0,
                    remarks: item.remarks,
                  }))}
                />
              </div>
            </section>
          ) : returnOpen ? (
            <section className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <PackageCheck className="size-5 text-[#9a6a2f]" />
                <h3 className="font-semibold">Return quality check</h3>
              </div>
              <ReturnQualityCheckForm jobId={job.id} items={returnItems} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
