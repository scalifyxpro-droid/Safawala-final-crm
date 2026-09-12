import Link from 'next/link';
import { X, AlertTriangle, CalendarDays, MapPin, UserRound } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { Badge } from '@/components/ui/badge';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { getJob } from '@/lib/event-jobs/store';
import { JobTracker } from '@/components/staff-portal/job-tracker';
import { WarehousePrepForm } from '@/components/staff-portal/warehouse-prep-form';
import { WarehousePickSlipButton } from '@/components/staff-portal/warehouse-pick-slip-button';
import { ReturnWarehouseForm } from '@/components/staff-portal/return-warehouse-form';
import { ReturnWarehouseSlipButton } from '@/components/staff-portal/return-slips';
import { withServiceRole } from '@/lib/db/client';

type BookingContext = {
  booking_number: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  contact_name: string | null;
  alternate_mobile: string | null;
  customers:
    | { name: string; phone: string }
    | { name: string; phone: string }[]
    | null;
  booking_items: {
    item_name: string;
    quantity: number;
    products: { barcode: string | null } | { barcode: string | null }[] | null;
  }[];
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const QC_ISSUE_LABEL: Record<string, string> = {
  stain: 'Stain',
  tear: 'Tear',
  missing_part: 'Missing part',
  other: 'Other',
  none: 'Issue',
};

export async function WarehouseJobModal({
  jobId,
  view = 'open',
}: {
  jobId: string;
  view?: 'open' | 'closed';
}) {
  const [session, job] = await Promise.all([
    requireDepartment('warehouse'),
    getJob(jobId),
  ]);
  if (!job || job.bookingType !== 'rental') return null;

  const stage = job.stages.find((item) => item.key === 'warehouse_pick');
  const returnStage = job.stages.find(
    (item) => item.key === 'return_warehouse',
  );
  if (!stage || !returnStage) return null;

  const bookingRows = await withServiceRole((tx) =>
    tx.unsafe(
      `select
         b.booking_number, b.event_name, b.event_date, b.event_time, b.event_location,
         b.contact_name, b.alternate_mobile,
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
  const booking = ((bookingRows as unknown as BookingContext[])[0] ?? null) as BookingContext | null;
  const customer = firstRelation(booking?.customers);
  const items = booking?.booking_items?.length
    ? booking.booking_items.map((item) => ({
        itemName: item.item_name,
        quantity: Number(item.quantity),
        barcode: firstRelation(item.products)?.barcode ?? null,
      }))
    : job.requiredItems.map((item) => ({ ...item, barcode: null }));
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
  const isOpen = stage.status === 'open' || stage.status === 'in_progress';
  const returnIsOpen =
    returnStage.status === 'open' || returnStage.status === 'in_progress';
  const qcRejectedItems = (job.qualityCheck?.items ?? []).filter(
    (item) => (item.goodQuantity ?? 0) < (item.checkedQuantity ?? 0),
  );
  const returnItems = (job.returnQualityCheck?.items ?? []).map((item) => {
    const collected = job.collectionCheck?.items.find(
      (entry) => entry.itemName === item.itemName,
    );
    return {
      itemName: item.itemName,
      usableQuantity: item.goodQuantity ?? 0,
      damagedRepairQuantity: item.damagedQuantity ?? 0,
      missingLostQuantity: collected
        ? Math.max(
            collected.sentQuantity - (collected.returnedQuantity ?? 0),
            0,
          )
        : 0,
    };
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Warehouse job details"
    >
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[#dfd3c3] bg-[#fcfaf7] dark:bg-[#241e17] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-border bg-white dark:bg-card px-5 py-4 sm:px-6">
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
                ? '/staff-portal/warehouse?view=closed'
                : '/staff-portal/warehouse'
            }
            aria-label="Close job details"
            className="rounded-full p-2 text-muted-foreground transition hover:bg-[#f5ead8] hover:text-[#70481c]"
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
                Rental picking
              </Badge>
              <span className="text-sm text-muted-foreground">
                {items.length} item{items.length === 1 ? '' : 's'}
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

          {job.warehousePrep && stage.status === 'done' ? (
            <section className="mt-4 rounded-xl border border-emerald-200 bg-white dark:bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-emerald-800">
                    Picking completed
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Completed by {job.warehousePrep.completedBy} on{' '}
                    {friendlyDate(job.warehousePrep.completedAt ?? '')}
                  </p>
                </div>
                <WarehousePickSlipButton
                  details={details}
                  items={job.warehousePrep.items.map((item) => ({
                    itemName: item.itemName,
                    quantity: item.requiredQuantity,
                    barcode:
                      items.find((entry) => entry.itemName === item.itemName)
                        ?.barcode ?? null,
                    picked: (item.preparedQuantity ?? 0) > 0,
                  }))}
                />
              </div>
              <ul className="mt-4 divide-y rounded-xl border">
                {job.warehousePrep.items.map((item) => (
                  <li
                    key={item.itemName}
                    className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <span className="font-medium">{item.itemName}</span>
                    <Badge
                      variant="outline"
                      className={
                        (item.preparedQuantity ?? 0) > 0
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }
                    >
                      {(item.preparedQuantity ?? 0) > 0
                        ? 'Picked'
                        : 'Not picked'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : isOpen ? (
            <div className="mt-4 space-y-4">
              {qcRejectedItems.length ? (
                <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-amber-700" />
                    <h3 className="font-semibold text-amber-900">
                      Sent back by Quality Check
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-amber-800">
                    Quality Check flagged {qcRejectedItems.length} item
                    {qcRejectedItems.length === 1 ? '' : 's'}. Correct these before sending back to QC.
                  </p>
                  <ul className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-lg border border-amber-200 bg-white/70">
                    {qcRejectedItems.map((item) => (
                      <li key={item.itemName} className="px-3 py-2.5 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="font-medium text-amber-900">{item.itemName}</strong>
                          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
                            {QC_ISSUE_LABEL[item.issueType] ?? 'Issue'}
                          </Badge>
                        </div>
                        {item.remarks ? (
                          <p className="mt-1 text-xs text-amber-700">{item.remarks}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <WarehousePrepForm
                jobId={job.id}
                items={items}
                details={details}
              />
            </div>
          ) : null}

          {job.returnWarehouseCheck ? (
            <section className="mt-4 rounded-xl border border-emerald-200 bg-white dark:bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-emerald-800">
                    Return receiving completed
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Received from{' '}
                    {job.returnWarehouseCheck.receivedFrom ?? 'QC'} by{' '}
                    {job.returnWarehouseCheck.completedBy} on{' '}
                    {friendlyDate(job.returnWarehouseCheck.completedAt ?? '')}.
                  </p>
                </div>
                <ReturnWarehouseSlipButton
                  details={{
                    ...details,
                    completedBy:
                      job.returnWarehouseCheck.completedBy ?? session.name,
                    completedAt:
                      job.returnWarehouseCheck.completedAt ?? job.updatedAt,
                  }}
                  items={job.returnWarehouseCheck.items.map((item) => ({
                    ...item,
                    storageLocation: item.storageLocation ?? '',
                  }))}
                />
              </div>
              <ul className="mt-4 divide-y rounded-xl border">
                {job.returnWarehouseCheck.items.map((item) => (
                  <li
                    key={item.itemName}
                    className="flex flex-col gap-1 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium">{item.itemName}</span>
                    <span className="text-muted-foreground">
                      {item.usableQuantity} usable ·{' '}
                      {item.damagedRepairQuantity} repair ·{' '}
                      {item.missingLostQuantity} missing ·{' '}
                      {item.storageLocation || 'No location'}
                    </span>
                  </li>
                ))}
              </ul>
              {job.returnWarehouseCheck.receivingNotes ? (
                <p className="mt-3 rounded-lg bg-[#fcfaf7] dark:bg-[#241e17] p-3 text-sm text-muted-foreground">
                  {job.returnWarehouseCheck.receivingNotes}
                </p>
              ) : null}
            </section>
          ) : returnIsOpen && job.returnQualityCheck ? (
            <div className="mt-4">
              <ReturnWarehouseForm jobId={job.id} items={returnItems} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
