import { notFound, redirect } from 'next/navigation';
import { CalendarDays, MapPin, PackageCheck, UserRound } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { getJob } from '@/lib/event-jobs/store';
import { CollectionCheckForm } from '@/components/staff-portal/collection-check-form';
import { CollectionSlipButton } from '@/components/staff-portal/collection-slip-button';
import { JobTracker } from '@/components/staff-portal/job-tracker';
import { withServiceRole } from '@/lib/db/client';

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
};

function firstRelation<T>(value: Relation<T> | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function CollectionJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const [session, job] = await Promise.all([requireDepartment('collection'), getJob(jobId)]);
  if (!job) notFound();
  if (job.bookingType !== 'rental') redirect('/staff-portal/collection');

  const stage = job.stages.find((item) => item.key === 'collection');
  if (!stage) notFound();
  const isOpen = stage.status === 'open' || stage.status === 'in_progress';
  if ((!isOpen || !job.stylistExecutions.some((entry) => entry.status === 'work_completed')) && !job.collectionCheck) redirect('/staff-portal/collection');

  const bookingRows = await withServiceRole((tx) =>
    tx.unsafe(
      `select
         b.event_name, b.event_date, b.event_time, b.event_location, b.contact_name, b.alternate_mobile,
         case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers
       from public.bookings b
       left join public.customers c on c.id = b.customer_id
       where b.id = $1
       limit 1`,
      [job.bookingId],
    ),
  );
  const booking = ((bookingRows as unknown as BookingContext[])[0] ?? null) as BookingContext | null;
  const customer = firstRelation(booking?.customers);
  const customerName = customer?.name ?? booking?.contact_name ?? 'Customer';
  const customerPhone = booking?.alternate_mobile ?? customer?.phone ?? '';
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

  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[900px] space-y-5">
        <DashboardHeader title="Collection job" subtitle={`${job.id} · ${customerName}`} backHref="/staff-portal/collection" />

        <section className="rounded-2xl border border-[#dfd3c3] bg-white dark:bg-card p-5 shadow-level-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{customerName}</h1>
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
          <section className="rounded-2xl border border-emerald-200 bg-white dark:bg-card p-5 shadow-level-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-emerald-800"><PackageCheck className="size-5" /> Collection handed over</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {job.collectionCheck.completedBy} collected from {job.collectionCheck.collectedFrom ?? 'customer'} and handed over to {job.collectionCheck.handedOverTo ?? 'showroom'}.
                </p>
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
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {job.collectionCheck.items.length} products checked
              </Badge>
              <Badge variant="outline" className={missingCount ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                {missingCount ? `${missingCount} missing` : 'Nothing missing'}
              </Badge>
            </div>
            <ul className="mt-4 divide-y rounded-xl border">
              {job.collectionCheck.items.map((item) => {
                const complete = (item.returnedQuantity ?? 0) === item.sentQuantity;
                return (
                  <li key={item.itemName} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                    <span><strong className="block font-medium">{item.itemName}</strong>{item.remarks ? <span className="text-xs text-muted-foreground">{item.remarks}</span> : null}</span>
                    <Badge variant="outline" className={complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}>
                      {item.returnedQuantity ?? 0} / {item.sentQuantity} collected
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {job.collectionCheck.handoverNotes ? <p className="mt-4 rounded-lg bg-[#fcfaf7] dark:bg-[#241e17] p-3 text-sm text-muted-foreground">{job.collectionCheck.handoverNotes}</p> : null}
          </section>
        ) : isOpen ? (
          <CollectionCheckForm jobId={job.id} items={items} />
        ) : null}
      </div>
    </StaffPortalShell>
  );
}
