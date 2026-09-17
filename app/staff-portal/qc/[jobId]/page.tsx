import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { CalendarDays, MapPin, PackageCheck, UserRound } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { getJob } from '@/lib/event-jobs/store';
import { JobTracker } from '@/components/staff-portal/job-tracker';
import { QualityCheckForm } from '@/components/staff-portal/quality-check-form';
import { PackingChecklistForm } from '@/components/staff-portal/packing-checklist-form';
import { PackingSlipButton } from '@/components/staff-portal/packing-slip-button';
import { ReturnQualityCheckForm } from '@/components/staff-portal/return-quality-check-form';
import { ReturnQcSlipButton } from '@/components/staff-portal/return-slips';
import { QcReturnToWarehouseForm } from '@/components/staff-portal/qc-return-to-warehouse-form';
import { withServiceRole } from '@/lib/db/client';
import { getSignedFileUrl } from '@/lib/storage/client';

const PROOF_BUCKET = 'event-operation-files';

export const dynamic = 'force-dynamic';

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

function firstRelation<T>(value: Relation<T> | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function QcJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const [session, job] = await Promise.all([requireDepartment('qc'), getJob(jobId)]);
  if (!job) notFound();

  const qcStage = job.stages.find((stage) => stage.key === 'quality_check');
  const packingStage = job.stages.find((stage) => stage.key === 'packing');
  const returnQcStage = job.stages.find((stage) => stage.key === 'return_quality_check');
  const warehousePickStage = job.stages.find((stage) => stage.key === 'warehouse_pick');
  if (!qcStage || !packingStage || !returnQcStage) notFound();

  const qcOpen = qcStage.status === 'open' || qcStage.status === 'in_progress';
  const packingOpen = packingStage.status === 'open' || packingStage.status === 'in_progress';
  const returnQcOpen = returnQcStage.status === 'open' || returnQcStage.status === 'in_progress';
  if (!qcOpen && !packingOpen && !returnQcOpen && !job.qualityCheck && !job.packingChecklist && !job.returnQualityCheck) {
    redirect('/staff-portal/qc');
  }

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
  const booking = ((bookingRows as unknown as BookingContext[])[0] ?? null) as BookingContext | null;
  const customer = firstRelation(booking?.customers);
  const barcodeByItem = new Map(
    (booking?.booking_items ?? []).map((item) => [item.item_name, firstRelation(item.products)?.barcode ?? null]),
  );
  const qcItems = (job.warehousePrep?.items ?? job.requiredItems.map((item) => ({
    itemName: item.itemName,
    requiredQuantity: item.quantity,
    preparedQuantity: item.quantity,
  })))
    .filter((item) => (item.preparedQuantity ?? 0) > 0)
    .map((item) => ({
      itemName: item.itemName,
      quantity: item.preparedQuantity ?? 0,
      barcode: barcodeByItem.get(item.itemName) ?? null,
    }));
  const packedItems = (job.qualityCheck?.items ?? [])
    .filter((item) => (item.goodQuantity ?? 0) > 0)
    .map((item) => ({
      itemName: item.itemName,
      quantity: item.goodQuantity ?? 0,
      barcode: barcodeByItem.get(item.itemName) ?? null,
    }));
  const slipDetails = {
    jobId: job.id,
    bookingNumber: job.bookingNumber,
    customerName: customer?.name ?? booking?.contact_name ?? 'Customer',
    customerPhone: booking?.alternate_mobile ?? customer?.phone ?? '',
    eventName: booking?.event_name ?? job.eventSummary.eventName,
    eventDate: booking?.event_date ?? job.eventSummary.eventDate,
    eventTime: booking?.event_time ?? job.eventSummary.eventTime,
    venue: booking?.event_location ?? job.eventSummary.venue,
  };
  const proofPaths = job.packingChecklist?.proofPhotoPaths ?? [];
  const qcProofPhotoUrls = (
    await Promise.all((job.qualityCheck?.proofPhotoPaths ?? []).map((path) => getSignedFileUrl(PROOF_BUCKET, path).catch(() => null)))
  ).filter((url): url is string => Boolean(url));
  const proofPhotoUrls = (
    await Promise.all(proofPaths.map((path) => getSignedFileUrl(PROOF_BUCKET, path)))
  ).filter((url): url is string => typeof url === 'string' && url.length > 0);
  const returnProofPaths = job.returnQualityCheck?.proofPhotoPaths ?? [];
  const returnProofPhotoUrls = (
    await Promise.all(returnProofPaths.map((path) => getSignedFileUrl(PROOF_BUCKET, path)))
  ).filter((url): url is string => typeof url === 'string' && url.length > 0);
  const returnQcItems = (job.collectionCheck?.items ?? []).map((item) => ({
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
  const canReturnToWarehouse =
    job.status === 'active' && Boolean(job.qualityCheck) &&
    qcStage.status === 'done' && warehousePickStage?.status === 'done' &&
    !job.bookingFinalCheck && !job.collectionCheck &&
    job.stages.every((stage) => !['collection', 'return_quality_check', 'return_warehouse'].includes(stage.key) || stage.status === 'not_started') &&
    job.stylistExecutions.every((entry) => entry.status === 'not_started');

  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[900px] space-y-5">
        <DashboardHeader title="QC & Packing job" subtitle={`${job.id} · ${slipDetails.customerName}`} backHref="/staff-portal/qc" />

        <section className="rounded-2xl border border-[#dfd3c3] bg-white dark:bg-card p-5 shadow-level-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{slipDetails.customerName}</h1>
                <Badge variant="outline" className="border-[#e4d2b6] bg-[#f5ead8] text-[#70481c]">{job.bookingType === 'sale' ? 'Sale' : 'Rental'} QC</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{job.id} · {job.bookingNumber}</p>
            </div>
            <p className="text-sm font-medium text-[#70481c]">{qcItems.length} product{qcItems.length === 1 ? '' : 's'}</p>
          </div>
          <div className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <p className="flex items-start gap-2"><UserRound className="mt-0.5 size-4 text-[#9a6a2f]" /><span><strong className="block font-medium">{slipDetails.eventName}</strong><span className="text-muted-foreground">{slipDetails.customerPhone || 'No alternate number'}</span></span></p>
            <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-[#9a6a2f]" /><span><strong className="block font-medium">{friendlyDate(slipDetails.eventDate)}</strong><span className="text-muted-foreground">{slipDetails.eventTime ? friendlyTime(slipDetails.eventTime) : 'Time not added'}</span></span></p>
            {slipDetails.venue ? <p className="flex items-center gap-2 text-muted-foreground sm:col-span-2"><MapPin className="size-4 text-[#9a6a2f]" /> {slipDetails.venue}</p> : null}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-white dark:bg-card p-2 shadow-level-1">
          <div className={`rounded-lg px-3 py-2.5 text-center text-sm font-medium ${qcSentBackToWarehouse ? 'bg-amber-100 text-amber-900' : job.qualityCheck ? 'bg-emerald-50 text-emerald-700' : qcOpen ? 'bg-[#a86f2c] text-white' : 'bg-muted text-muted-foreground'}`}>
            {qcSentBackToWarehouse ? '↩ Sent to Warehouse' : qcOpen && job.qualityCheck ? 'Quality recheck needed' : job.qualityCheck ? '✓ QC passed' : 'Quality check'}
          </div>
          <div className={`rounded-lg px-3 py-2.5 text-center text-sm font-medium ${job.packingChecklist ? 'bg-emerald-50 text-emerald-700' : packingOpen ? 'bg-[#a86f2c] text-white' : 'bg-muted text-muted-foreground'}`}>
            {job.packingChecklist ? '✓ Packed' : 'Packing'}
          </div>
        </div>

        <JobTracker stages={job.stages} stylistExecutions={job.stylistExecutions} />

        {qcOpen ? <QualityCheckForm jobId={job.id} items={qcItems} /> : job.qualityCheck ? (
          qcSentBackToWarehouse ? (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-level-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-amber-900">Sent back to Warehouse</h2>
                  <p className="mt-1 text-sm text-amber-800">Checked by {job.qualityCheck.completedBy} on {friendlyDate(job.qualityCheck.completedAt ?? '')} — flagged for correction, now with Warehouse.</p>
                </div>
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">{qcRejectedItemsCount} flagged</Badge>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-200 bg-white dark:bg-card p-5 shadow-level-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold text-emerald-800">Quality check completed</h2><p className="mt-1 text-sm text-muted-foreground">Completed by {job.qualityCheck.completedBy} on {friendlyDate(job.qualityCheck.completedAt ?? '')}</p></div>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{packedItems.length} passed</Badge>
              </div>
            </section>
          )
        ) : null}
        {job.qualityCheck && qcProofPhotoUrls.length ? (
          <section className="rounded-2xl border bg-white p-5 shadow-level-1 dark:bg-card">
            <h2 className="text-sm font-semibold">QC product photos</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {qcProofPhotoUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-lg border"><Image src={url} alt={`QC product proof ${index + 1}`} fill unoptimized sizes="(max-width: 640px) 50vw, 240px" className="object-cover" /></a>)}
            </div>
          </section>
        ) : null}
        {canReturnToWarehouse ? <QcReturnToWarehouseForm jobId={job.id} items={qcItems} /> : null}

        {job.qualityCheck && !job.packingChecklist && packingOpen ? <PackingChecklistForm jobId={job.id} details={slipDetails} items={packedItems} /> : null}

        {job.packingChecklist ? (
          <section className="rounded-2xl border border-emerald-200 bg-white dark:bg-card p-5 shadow-level-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-emerald-800">Packing completed</h2><p className="mt-1 text-sm text-muted-foreground">Completed by {job.packingChecklist.completedBy} on {friendlyDate(job.packingChecklist.completedAt ?? '')}</p></div>
              <PackingSlipButton details={slipDetails} items={packedItems} />
            </div>
            {proofPhotoUrls.length ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Packing proof</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {proofPhotoUrls.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border bg-muted">
                      <span className="relative block aspect-square">
                        <Image src={url} alt={`Packing proof ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {job.returnQualityCheck ? (
          <section className="rounded-2xl border border-emerald-200 bg-white dark:bg-card p-5 shadow-level-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-emerald-800">Return QC completed</h2><p className="mt-1 text-sm text-muted-foreground">Completed by {job.returnQualityCheck.completedBy} on {friendlyDate(job.returnQualityCheck.completedAt ?? '')}. Sent to Return Warehouse.</p></div>
              <ReturnQcSlipButton
                details={{ ...slipDetails, completedBy: job.returnQualityCheck.completedBy ?? session.name, completedAt: job.returnQualityCheck.completedAt ?? job.updatedAt }}
                items={job.returnQualityCheck.items.map((item) => ({ itemName: item.itemName, returnedQuantity: item.returnedQuantity, goodQuantity: item.goodQuantity ?? 0, damagedQuantity: item.damagedQuantity ?? 0, remarks: item.remarks }))}
              />
            </div>
            {returnProofPhotoUrls.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {returnProofPhotoUrls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border bg-muted">
                    <span className="relative block aspect-square"><Image src={url} alt={`Return QC issue proof ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover" /></span>
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ) : returnQcOpen ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1"><PackageCheck className="size-5 text-[#9a6a2f]" /><h2 className="font-semibold">Return quality check</h2></div>
            <ReturnQualityCheckForm jobId={job.id} items={returnQcItems} />
          </section>
        ) : null}
      </div>
    </StaffPortalShell>
  );
}
