import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { CalendarClock, MapPin, UserCheck, UsersRound } from 'lucide-react';
import { setStylistsRequiredAction } from '@/app/stylist-approvals/actions';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StylistAssignmentPanel } from '@/components/stylist/stylist-assignment-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaginatedList } from '@/components/ui/paginated-list';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { stylistJobsForAdmin } from '@/lib/event-jobs/store';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function StylistApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const [profile] = await withUserContext(user.id, (tx) => tx<{ role: string }[]>`
    select role from public.profiles where id = ${user.id}
  `);
  if (profile?.role !== 'admin') redirect('/staff-portal');
  const jobs = (await stylistJobsForAdmin())
    .filter((job) => job.status === 'active')
    .sort((a, b) => a.eventSummary.eventDate.localeCompare(b.eventSummary.eventDate));
  const awaiting = jobs.reduce((sum, job) => sum + job.stylistInterests.filter((interest) => interest.status === 'interested').length, 0);
  const assigned = jobs.reduce((sum, job) => sum + job.stylistInterests.filter((interest) => interest.status === 'approved').length, 0);

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <DashboardHeader title="Stylist Approvals" subtitle="Assign interested stylists to rental events" backHref="/dashboard" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary icon={<CalendarClock />} label="Rental events" value={jobs.length} />
          <Summary icon={<UsersRound />} label="Awaiting decision" value={awaiting} />
          <Summary icon={<UserCheck />} label="Assigned stylists" value={assigned} />
        </div>

        {jobs.length ? (
          <div className="space-y-5">
            <PaginatedList itemLabel="rental events">
            {jobs.map((job) => (
              <Card key={job.id} className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
                <CardHeader className="border-b border-[#e8dccb] bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-[#dfc6a4] bg-[#f5ead8] dark:bg-[#33291c] text-[#70481c]">Rental</Badge>
                        <Link href={`/event-jobs/${job.id}`} className="font-semibold text-primary hover:underline">{job.id}</Link>
                        <span className="text-sm text-muted-foreground">{job.bookingNumber}</span>
                      </div>
                      <CardTitle className="mt-2 text-lg">{job.eventSummary.customerName || 'Customer not added'}</CardTitle>
                      <p className="mt-0.5 text-sm text-muted-foreground">{job.eventSummary.eventName} · {job.bookingNumber}</p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5"><CalendarClock className="size-4" />Event date: {friendlyDate(job.eventSummary.eventDate)} · {friendlyTime(job.eventSummary.eventTime)}</span>
                        {job.eventSummary.venue ? <span className="flex items-center gap-1.5"><MapPin className="size-4" />{job.eventSummary.venue}</span> : null}
                      </p>
                    </div>
                    <form action={setStylistsRequiredAction} className="flex w-full items-end gap-2 rounded-xl border border-border bg-white dark:bg-card p-2.5 lg:w-auto">
                      <input type="hidden" name="jobId" value={job.id} />
                      <label className="flex-1 text-xs font-medium text-muted-foreground lg:w-32">Stylists required<input name="count" type="number" min={0} defaultValue={job.stylistsRequiredCount} className="mt-1 h-9 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" /></label>
                      <Button type="submit" variant="outline" size="sm">Update</Button>
                    </form>
                  </div>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  <StylistAssignmentPanel jobId={job.id} requiredCount={job.stylistsRequiredCount} applicants={job.stylistInterests.map((interest) => ({ id: interest.id, name: interest.stylistName, status: interest.status }))} />
                </CardContent>
              </Card>
            ))}
            </PaginatedList>
          </div>
        ) : (
          <Card className="border-border shadow-level-1"><CardContent className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary"><UserCheck /></span><h3 className="mt-4 font-semibold">No rental events need stylist approval</h3><p className="mt-1 text-sm text-muted-foreground">Confirmed rental Event Jobs will appear here.</p></div></CardContent></Card>
        )}
      </div>
    </BookingPortalShell>
  );
}

function Summary({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <Card className="border-border shadow-level-1"><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-[#f5ead8] dark:bg-[#33291c] text-primary [&_svg]:size-5">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>;
}
