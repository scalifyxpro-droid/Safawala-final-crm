import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, MapPin, MessageCircle, PlaneTakeoff, UserRound } from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PaginatedList } from '@/components/ui/paginated-list';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { listJobs } from '@/lib/event-jobs/store';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function TravelPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const rows = (await listJobs())
    .filter((job) => job.status === 'active' && job.bookingType === 'rental')
    .flatMap((job) => job.stylistInterests.filter((interest) => interest.status === 'approved').map((interest) => ({ job, interest, plan: job.travelPlans.find((entry) => entry.interestId === interest.id) })))
    .sort((a, b) => a.job.eventSummary.eventDate.localeCompare(b.job.eventSummary.eventDate));
  const sentCount = rows.filter(({ plan }) => plan?.ticketConfirmedAt).length;

  return <BookingPortalShell email={user.email ?? 'Safawala user'}>
    <div className="mx-auto max-w-[1180px] space-y-5">
      <DashboardHeader title="Travel Manager" subtitle="Confirm tickets for staff selected for rental events" backHref="/dashboard" />

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<UserRound />} label="Selected staff" value={rows.length} />
        <Metric icon={<CheckCircle2 />} label="Tickets sent" value={sentCount} />
        <Metric icon={<Clock3 />} label="Tickets pending" value={rows.length - sentCount} />
      </div>

      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
        <div className="flex flex-col gap-2 border-b border-[#e8dccb] bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Rental event travel</h2><p className="mt-0.5 text-sm text-muted-foreground">Open a staff assignment to confirm its WhatsApp ticket delivery.</p></div><Badge variant="outline" className="w-fit border-[#dfc6a4] bg-[#f5ead8] dark:bg-[#33291c] text-[#70481c]">Rental only</Badge></div>
        <CardContent className="p-0">
          {rows.length ? <div className="divide-y divide-border"><PaginatedList itemLabel="travel assignments">{rows.map(({ job, interest, plan }) => {
            const sent = Boolean(plan?.ticketConfirmedAt);
            return <div key={`${job.id}-${interest.id}`} className="group p-4 sm:p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f5ead8] dark:bg-[#33291c] font-semibold text-primary">{interest.stylistName.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold">{interest.stylistName}</p><p className="mt-0.5 text-xs text-muted-foreground">{job.id} · {job.bookingNumber}</p></div></div>
                <div className="rounded-xl border border-border bg-[#fcfaf7] dark:bg-[#241e17] px-3.5 py-3"><p className="truncate font-semibold">{job.eventSummary.customerName || 'Customer not added'}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{job.eventSummary.eventName} · {job.bookingNumber}</p><p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />Event: {friendlyDate(job.eventSummary.eventDate)} · {friendlyTime(job.eventSummary.eventTime)}</span>{job.eventSummary.venue ? <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{job.eventSummary.venue}</span> : null}</p></div>
                <div className="flex items-center justify-between gap-3 md:justify-end"><Badge variant="outline" className={sent ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}>{sent ? <CheckCircle2 /> : <Clock3 />}{sent ? 'Ticket sent' : 'Pending'}</Badge><Button variant={sent ? 'outline' : 'default'} size="sm" render={<Link href={`/travel/${job.id}/${interest.id}`} />}>{sent ? 'View' : 'Confirm ticket'}<ArrowRight /></Button></div>
              </div>
            </div>;
          })}</PaginatedList></div> : <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary"><PlaneTakeoff /></span><h3 className="mt-4 font-semibold">No staff awaiting travel</h3><p className="mt-1 text-sm text-muted-foreground">Select a stylist for a rental event to create a travel entry.</p><Button className="mt-4" variant="outline" size="sm" render={<Link href="/stylist-approvals" />}><MessageCircle /> Open Stylist Approvals</Button></div></div>}
        </CardContent>
      </Card>
    </div>
  </BookingPortalShell>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <Card className="border-border shadow-level-1"><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-[#f5ead8] dark:bg-[#33291c] text-primary [&_svg]:size-5">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>;
}
