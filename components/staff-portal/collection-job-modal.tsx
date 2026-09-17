import Link from 'next/link';
import { CalendarDays, MapPin, PackageCheck, UserRound, X } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { Badge } from '@/components/ui/badge';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { getJob } from '@/lib/event-jobs/store';
import { CollectionCheckForm } from '@/components/staff-portal/collection-check-form';
import { CollectionSlipButton } from '@/components/staff-portal/collection-slip-button';
import { JobTracker } from '@/components/staff-portal/job-tracker';
import { withServiceRole } from '@/lib/db/client';

type BookingContext = {
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  contact_name: string | null;
  alternate_mobile: string | null;
  customers: { name: string; phone: string } | null;
};

export async function CollectionJobModal({ jobId, view }: { jobId: string; view: 'open' | 'closed' }) {
  const [session, job] = await Promise.all([requireDepartment('collection'), getJob(jobId)]);
  if (!job || job.bookingType !== 'rental') return null;
  const stage = job.stages.find((item) => item.key === 'collection');
  if (!stage) return null;
  const isOpen = stage.status === 'open' || stage.status === 'in_progress';
  if ((!isOpen || !job.stylistExecutions.some((entry) => entry.status === 'work_completed')) && !job.collectionCheck) return null;

  const [booking] = await withServiceRole((tx) => tx<BookingContext[]>`
    select b.event_name, b.event_date, b.event_time, b.event_location,
      b.contact_name, b.alternate_mobile,
      case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers
    from public.bookings b
    left join public.customers c on c.id = b.customer_id
    where b.id = ${job.bookingId}
    limit 1
  `);
  const customerName = booking?.customers?.name ?? booking?.contact_name ?? 'Customer';
  const customerPhone = booking?.alternate_mobile ?? booking?.customers?.phone ?? '';
  const eventName = booking?.event_name ?? job.eventSummary.eventName;
  const eventDate = booking?.event_date ?? job.eventSummary.eventDate;
  const eventTime = booking?.event_time ?? job.eventSummary.eventTime;
  const venue = booking?.event_location ?? job.eventSummary.venue;
  const items = job.requiredItems.map((item) => {
    const prepared = job.warehousePrep?.items.find((entry) => entry.itemName === item.itemName);
    return { itemName: item.itemName, sentQuantity: prepared?.preparedQuantity ?? item.quantity };
  });
  const missingCount = (job.collectionCheck?.items ?? []).reduce(
    (total, item) => total + Math.max(item.sentQuantity - (item.returnedQuantity ?? 0), 0),
    0,
  );
  const closeHref = `/staff-portal/collection?view=${view}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Collection job ${job.id}`}>
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[900px] overflow-y-auto rounded-2xl border border-[#dfd3c3] bg-[#fcfaf7] shadow-2xl dark:bg-[#241e17]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white px-4 py-4 dark:bg-card sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#70481c]">Rental collection · {job.id}</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{customerName}</h2>
            <p className="text-xs text-muted-foreground">{job.bookingNumber}</p>
          </div>
          <Link href={closeHref} aria-label="Close collection job details" className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-[#f5ead8] hover:text-[#70481c]"><X className="size-5" /></Link>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <section className="rounded-2xl border border-[#dfd3c3] bg-white p-4 shadow-level-1 dark:bg-card sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">{customerName}</h3>
                  <Badge variant="outline" className="border-[#e4d2b6] bg-[#f5ead8] text-[#70481c]">Rental collection</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{job.id} · {job.bookingNumber}</p>
              </div>
              <p className="text-sm font-medium text-[#70481c]">{items.length} product{items.length === 1 ? '' : 's'}</p>
            </div>
            <div className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <p className="flex items-start gap-2"><UserRound className="mt-0.5 size-4 text-[#9a6a2f]" /><span><strong className="block font-medium">{eventName}</strong><span className="text-muted-foreground">{customerPhone || 'No contact number'}</span></span></p>
              <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-[#9a6a2f]" /><span><strong className="block font-medium">{friendlyDate(eventDate)}</strong><span className="text-muted-foreground">{eventTime ? friendlyTime(eventTime) : 'Time not added'}</span></span></p>
              {venue ? <p className="flex items-center gap-2 text-muted-foreground sm:col-span-2"><MapPin className="size-4 text-[#9a6a2f]" /> {venue}</p> : null}
            </div>
          </section>

          <JobTracker stages={job.stages} stylistExecutions={job.stylistExecutions} />

          {job.collectionCheck ? (
            <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-level-1 dark:bg-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-emerald-800"><PackageCheck className="size-5" /> Collection handed over</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{job.collectionCheck.completedBy} collected from {job.collectionCheck.collectedFrom ?? 'customer'} and handed over to {job.collectionCheck.handedOverTo ?? 'showroom'}.</p>
                </div>
                <CollectionSlipButton
                  details={{
                    jobId: job.id,
                    bookingNumber: job.bookingNumber,
                    customerName,
                    customerPhone,
                    eventName,
                    eventDate,
                    eventTime,
                    venue,
                    collectedFrom: job.collectionCheck.collectedFrom ?? 'Customer / venue representative',
                    handedOverTo: job.collectionCheck.handedOverTo ?? 'Showroom',
                    completedBy: job.collectionCheck.completedBy ?? session.name,
                    completedAt: job.collectionCheck.completedAt ?? job.updatedAt,
                  }}
                  items={job.collectionCheck.items.map((item) => ({
                    itemName: item.itemName,
                    sentQuantity: item.sentQuantity,
                    returnedQuantity: item.returnedQuantity ?? 0,
                    remarks: item.remarks,
                  }))}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{job.collectionCheck.items.length} products checked</Badge>
                <Badge variant="outline" className={missingCount ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>{missingCount ? `${missingCount} missing` : 'Nothing missing'}</Badge>
              </div>
              <ul className="mt-4 divide-y rounded-xl border">
                {job.collectionCheck.items.map((item) => (
                  <li key={item.itemName} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                    <span><strong className="block font-medium">{item.itemName}</strong>{item.remarks ? <span className="text-xs text-muted-foreground">{item.remarks}</span> : null}</span>
                    <Badge variant="outline" className={(item.returnedQuantity ?? 0) === item.sentQuantity ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}>{item.returnedQuantity ?? 0} / {item.sentQuantity} collected</Badge>
                  </li>
                ))}
              </ul>
              {job.collectionCheck.handoverNotes ? <p className="mt-4 rounded-lg bg-[#fcfaf7] p-3 text-sm text-muted-foreground dark:bg-[#241e17]">{job.collectionCheck.handoverNotes}</p> : null}
            </section>
          ) : isOpen ? <CollectionCheckForm jobId={job.id} items={items} /> : null}
        </div>
      </div>
    </div>
  );
}
