import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarClock, MapPin, Phone } from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { friendlyDate, friendlyTime, statusLabel } from '@/lib/bookings';
import {
  trackingTimeline,
  TRACKING_STAGE_LABEL,
  STAGE_DEPARTMENT,
} from '@/lib/event-jobs/constants';
import {
  buildJobOverview,
  canCloseEventJob,
  getJob,
} from '@/lib/event-jobs/store';
import { addIssueAction, resolveIssueAction } from '@/app/event-jobs/actions';
import { getStaffSession } from '@/lib/staff-portal/session';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type JobBookingRow = {
  id: number;
  booking_number: string;
  booking_type: string;
  status: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  customers: { name: string; phone: string } | null;
  booking_items: { item_name: string; quantity: number }[];
};

function stageTone(status: string) {
  if (status === 'done')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'open' || status === 'in_progress')
    return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-stone-200 bg-stone-50 text-stone-600 dark:border-border dark:bg-muted dark:text-muted-foreground';
}

export default async function EventJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staffSession = await getStaffSession();

  const job = await getJob(id);
  if (!job) notFound();
  const isCollectionAccount = staffSession?.departments.some(
    (grant) => grant.active && grant.department === 'collection',
  );
  if (isCollectionAccount && job.bookingType !== 'rental')
    redirect('/event-jobs');

  const booking = await withUserContext(user.id, async (tx) => {
    const rows = await tx<JobBookingRow[]>`
      select
        b.id, b.booking_number, b.booking_type, b.status, b.event_name,
        b.event_date, b.event_time, b.event_location,
        case when c.id is null then null else json_build_object('name', c.name, 'phone', c.phone) end as customers,
        coalesce(items.booking_items, '[]'::json) as booking_items
      from public.bookings b
      left join public.customers c on c.id = b.customer_id
      left join lateral (
        select json_agg(json_build_object('item_name', bi.item_name, 'quantity', bi.quantity) order by bi.id) as booking_items
        from public.booking_items bi
        where bi.booking_id = b.id
      ) items on true
      where b.id = ${job.bookingId}
      limit 1
    `;
    return rows[0] ?? null;
  });

  return (
    <BookingPortalShell email={user.email || 'Safawala user'}>
      <div className="mx-auto max-w-[1080px] space-y-6">
        <DashboardHeader
          title={job.id}
          backHref="/event-jobs"
          subtitle={
            booking
              ? `${booking.event_name} · ${booking.booking_number}`
              : job.bookingNumber
          }
        />

        <Card className="border-border shadow-level-1">
          <CardHeader>
            <CardTitle>Master overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {buildJobOverview(job).map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <Badge
                    variant="outline"
                    className={
                      row.tone === 'done'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : row.tone === 'attention'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : row.tone === 'pending'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
                    }
                  >
                    {row.value}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {job.status === 'closed'
                ? 'This Event Job is closed.'
                : canCloseEventJob(job)
                  ? 'Ready for Booking to Close Event.'
                  : 'Cannot close yet — some stages, stylist assignment, or open issues are still pending.'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-level-1">
          <CardHeader>
            <CardTitle>Booking &amp; event details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {booking ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Customer
                  </p>
                  <p className="mt-1 font-medium">
                    {booking.customers?.name ?? 'Walk-in'}
                  </p>
                  {booking.customers?.phone ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="size-3.5" /> {booking.customers.phone}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Event
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-medium">
                    <CalendarClock className="size-4" />{' '}
                    {friendlyDate(booking.event_date)} ·{' '}
                    {friendlyTime(booking.event_time)}
                  </p>
                  {booking.event_location ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" /> {booking.event_location}
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Required services / items
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {(booking.booking_items ?? []).map((item, index) => (
                      <li key={index} className="text-muted-foreground">
                        {item.quantity}x {item.item_name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Booking status
                  </p>
                  <p className="mt-1 font-medium">
                    {statusLabel(booking.status)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Event
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-medium">
                    <CalendarClock className="size-4" />{' '}
                    {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                    {friendlyTime(job.eventSummary.eventTime)}
                  </p>
                  {job.eventSummary.venue ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" /> {job.eventSummary.venue}
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Required services / items
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {job.requiredItems.map((item, index) => (
                      <li key={index} className="text-muted-foreground">
                        {item.quantity}x {item.itemName}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-level-1">
          <CardHeader>
            <CardTitle>Stages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trackingTimeline(job.stages).map((stage) => (
              <div
                key={stage.key}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{TRACKING_STAGE_LABEL[stage.key]}</p>
                  <p className="text-xs text-muted-foreground">
                    {STAGE_DEPARTMENT[stage.key as keyof typeof STAGE_DEPARTMENT]
                      ? `Department: ${STAGE_DEPARTMENT[stage.key as keyof typeof STAGE_DEPARTMENT]}`
                      : 'Workflow milestone'}
                  </p>
                </div>
                <Badge variant="outline" className={stageTone(stage.status)}>
                  {stage.status.replace('_', ' ')}
                </Badge>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Stage actions (pick, QC, packing and stylist interest) happen in
              each department&apos;s work area. This overview keeps progress
              visible without bypassing department permissions.
            </p>
          </CardContent>
        </Card>

        {job.warehousePrep ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Warehouse preparation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Completed by {job.warehousePrep.completedBy} on{' '}
                {friendlyDate(job.warehousePrep.completedAt ?? '')}
              </p>
              <ul className="space-y-1.5 text-sm">
                {job.warehousePrep.items.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0"
                  >
                    <span>{item.itemName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.preparedQuantity ?? 0} / {item.requiredQuantity}{' '}
                      prepared
                      {item.unavailable ? ' · unavailable' : ''}
                      {item.damaged ? ' · damaged' : ''}
                      {item.otherIssue ? ` · ${item.otherIssue}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {job.qualityCheck ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Quality check</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Completed by {job.qualityCheck.completedBy} on{' '}
                {friendlyDate(job.qualityCheck.completedAt ?? '')}
              </p>
              <ul className="space-y-1.5 text-sm">
                {job.qualityCheck.items.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0"
                  >
                    <span>{item.itemName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.goodQuantity ?? 0} / {item.checkedQuantity ?? 0}{' '}
                      good
                      {item.issueType !== 'none'
                        ? ` · ${item.issueType.replace('_', ' ')}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {job.packingChecklist ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Packing checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Completed by {job.packingChecklist.completedBy} on{' '}
                {friendlyDate(job.packingChecklist.completedAt ?? '')}
              </p>
              {job.packingChecklist.remarks ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.packingChecklist.remarks}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {job.stylistsRequired ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Stylist interest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {
                  job.stylistInterests.filter(
                    (interest) => interest.status === 'approved',
                  ).length
                }{' '}
                / {job.stylistsRequiredCount} approved ·{' '}
                <Link
                  href="/stylist-approvals"
                  className="text-primary hover:underline"
                >
                  Review in Stylist Approvals
                </Link>{' '}
                ·{' '}
                <Link href="/travel" className="text-primary hover:underline">
                  Travel &amp; accommodation
                </Link>
              </p>
              {job.stylistInterests.length ? (
                <ul className="space-y-1.5 text-sm">
                  {job.stylistInterests.map((interest) => {
                    const execution = job.stylistExecutions.find(
                      (entry) =>
                        entry.stylistAccountId === interest.stylistAccountId,
                    );
                    return (
                      <li
                        key={interest.id}
                        className="flex items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0"
                      >
                        <span>{interest.stylistName}</span>
                        <span className="text-xs text-muted-foreground">
                          {interest.status}
                          {interest.status === 'approved' && execution
                            ? ` · ${execution.status.replace(/_/g, ' ')}`
                            : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No stylists have shown interest yet.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {job.collectionCheck ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Collection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Completed by {job.collectionCheck.completedBy} on{' '}
                {friendlyDate(job.collectionCheck.completedAt ?? '')}
              </p>
              <ul className="space-y-1.5 text-sm">
                {job.collectionCheck.items.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0"
                  >
                    <span>{item.itemName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.returnedQuantity ?? 0} / {item.sentQuantity}{' '}
                      returned
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {job.returnQualityCheck ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Return QC</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Completed by {job.returnQualityCheck.completedBy} on{' '}
                {friendlyDate(job.returnQualityCheck.completedAt ?? '')}
              </p>
              <ul className="space-y-1.5 text-sm">
                {job.returnQualityCheck.items.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0"
                  >
                    <span>{item.itemName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.goodQuantity ?? 0} good /{' '}
                      {item.damagedQuantity ?? 0} damaged
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {job.returnWarehouseCheck ? (
          <Card className="border-border shadow-level-1">
            <CardHeader>
              <CardTitle>Return Warehouse</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Completed by {job.returnWarehouseCheck.completedBy} on{' '}
                {friendlyDate(job.returnWarehouseCheck.completedAt ?? '')}
              </p>
              <ul className="space-y-1.5 text-sm">
                {job.returnWarehouseCheck.items.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0"
                  >
                    <span>{item.itemName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.usableQuantity} usable ·{' '}
                      {item.damagedRepairQuantity} damaged/repair ·{' '}
                      {item.missingLostQuantity} missing/lost
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border shadow-level-1">
          <CardHeader>
            <CardTitle>Issues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!staffSession ? (
              <form
                action={addIssueAction}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <input type="hidden" name="jobId" value={job.id} />
                <input
                  name="description"
                  required
                  placeholder="Describe an issue for this job…"
                  className="h-10 flex-1 rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <Button type="submit" size="sm">
                  Add issue
                </Button>
              </form>
            ) : null}
            {job.issues.length ? (
              <ul className="space-y-2">
                {job.issues.map((issue) => (
                  <li
                    key={issue.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <div>
                      <p
                        className={
                          issue.resolved
                            ? 'text-muted-foreground line-through'
                            : ''
                        }
                      >
                        {issue.description}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Raised by {issue.raisedBy} ·{' '}
                        {friendlyDate(issue.raisedAt)}
                      </p>
                    </div>
                    {!issue.resolved && !staffSession ? (
                      <form action={resolveIssueAction}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="issueId" value={issue.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Resolve
                        </Button>
                      </form>
                    ) : issue.resolved ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Resolved
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No issues raised for this job.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-level-1">
          <CardHeader>
            <CardTitle>Activity history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {job.activity.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-border pb-2 last:border-0"
                >
                  <p>
                    <span className="font-medium">{entry.actor}</span>
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      ({entry.department})
                    </span>{' '}
                    — {entry.action.replace(/_/g, ' ')}
                  </p>
                  {entry.details ? (
                    <p className="text-xs text-muted-foreground">
                      {entry.details}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {friendlyDate(entry.at)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </BookingPortalShell>
  );
}
