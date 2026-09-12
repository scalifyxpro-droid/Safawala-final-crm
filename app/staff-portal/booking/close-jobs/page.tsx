import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CircleCheckBig } from 'lucide-react';
import { requireDepartment } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate, money } from '@/lib/bookings';
import { listActiveJobs } from '@/lib/event-jobs/store';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function CloseJobsPage() {
  const session = await requireDepartment('booking');
  if (!session.isMainId) redirect('/staff-portal');

  const jobs = (await listActiveJobs()).filter((job) => {
    const finalStage = job.stages.find((stage) => stage.key === 'booking_final_check');
    return finalStage?.status === 'open' || finalStage?.status === 'in_progress';
  });
  const bookingIds = jobs.map((job) => job.bookingId);
  const bookings = bookingIds.length
    ? await withUserContext(session.id, (tx) =>
        tx.unsafe(
          `select b.id, case when c.id is null then null else json_build_object('name', c.name) end as customers
           from public.bookings b
           left join public.customers c on c.id = b.customer_id
           where b.id = any($1::bigint[])`,
          [bookingIds],
        ),
      )
    : [];
  const customerByBooking = new Map(
    (bookings as unknown as { id: number; customers: { name: string } | null }[]).map((booking) => [
      Number(booking.id),
      booking.customers?.name ?? 'Customer',
    ]),
  );

  return (
    <StaffPortalShell
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1000px] space-y-5">
        <DashboardHeader
          title="Close Jobs"
          subtitle="Check the final payment and close completed rental jobs"
        />

        {jobs.length ? (
          <div className="space-y-3">
            {jobs.map((job) => {
              const pending = Math.max(job.paymentSummary?.pendingBalance ?? 0, 0);
              return (
                <Card key={job.id} className="border-border py-0 shadow-level-1 ring-0">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                      <CircleCheckBig className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {customerByBooking.get(job.bookingId)} · {job.bookingNumber}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {job.eventSummary.eventName} · {friendlyDate(job.eventSummary.eventDate)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Payment pending</p>
                        <Badge
                          variant="outline"
                          className={
                            pending > 0
                              ? 'mt-1 border-amber-200 bg-amber-50 text-amber-800'
                              : 'mt-1 border-emerald-200 bg-emerald-50 text-emerald-700'
                          }
                        >
                          {pending > 0 ? money(pending) : 'Fully paid'}
                        </Badge>
                      </div>
                      <Button render={<Link href={`/staff-portal/booking/${job.id}`} />}>
                        Check &amp; Close <ArrowRight />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-border shadow-level-1">
            <CardContent className="grid min-h-64 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                  <CircleCheckBig />
                </span>
                <h2 className="mt-4 font-semibold">No jobs are waiting</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A job appears here after Return Warehouse is completed.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </StaffPortalShell>
  );
}
