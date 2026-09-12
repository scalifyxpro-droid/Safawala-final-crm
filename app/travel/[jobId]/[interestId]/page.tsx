import { notFound, redirect } from 'next/navigation';
import { CalendarClock, CheckCircle2, FileText, MapPin, MessageCircle, Phone, Upload, UserRound } from 'lucide-react';
import { confirmTicketSentAction, uploadTicketAction } from '@/app/travel/actions';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { getJob } from '@/lib/event-jobs/store';
import { getCurrentUser } from '@/lib/auth/session';
import { withServiceRole } from '@/lib/db/client';
import { getSignedFileUrl } from '@/lib/storage/client';

const TICKET_BUCKET = 'stylist-tickets';

export const dynamic = 'force-dynamic';

export default async function TravelPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string; interestId: string }>;
  searchParams: Promise<{ confirmed?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { jobId, interestId } = await params;
  const job = await getJob(jobId);
  if (!job || job.bookingType !== 'rental') notFound();
  const interest = job.stylistInterests.find((entry) => entry.id === interestId);
  if (!interest || interest.status !== 'approved') notFound();
  const plan = job.travelPlans.find((entry) => entry.interestId === interestId);
  const { confirmed, error } = await searchParams;
  const [selectedStaff] = await withServiceRole((tx) => tx<{ name: string; phone: string | null; login_id: string | null }[]>`
    select name, phone, login_id from public.staff_members where user_id = ${interest.stylistAccountId}
  `);

  // The bucket is private, so the only way to view an uploaded ticket is a
  // short-lived signed URL generated server-side -- never a public link. 30
  // minutes is plenty for an admin to open and check it.
  let ticketSignedUrl: string | null = null;
  if (plan?.ticketFilePath) {
    ticketSignedUrl = await getSignedFileUrl(TICKET_BUCKET, plan.ticketFilePath);
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1000px] space-y-5">
        <DashboardHeader title="Travel & Accommodation" subtitle={`${job.id} · ${job.bookingNumber}`} backHref="/travel" />
        <div className="overflow-hidden rounded-2xl border border-[#d9c7ad] bg-gradient-to-r from-[#5d422a] to-[#8d602b] p-5 text-white shadow-level-1 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Badge variant="outline" className="border-white/30 bg-white/10 text-white">Rental event</Badge><h1 className="mt-3 text-2xl font-semibold">Travel &amp; Accommodation</h1><p className="mt-1 text-sm text-white/75">{job.id} · {job.bookingNumber}</p></div><p className="flex items-center gap-1.5 text-sm text-white/85"><CalendarClock className="size-4" />{friendlyDate(job.eventSummary.eventDate)} · {friendlyTime(job.eventSummary.eventTime)}</p></div></div>

        {confirmed ? <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex items-center gap-2 p-4 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> Ticket confirmation saved and the selected staff member was notified.</CardContent></Card> : null}
        {error ? <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
            <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-8 place-items-center rounded-lg bg-[#f5ead8] dark:bg-[#33291c]"><UserRound className="size-4 text-primary" /></span> Selected staff</CardTitle></CardHeader>
            <CardContent className="space-y-2 p-5">
              <p className="text-lg font-semibold">{selectedStaff?.name ?? interest.stylistName}</p>
              <p className="text-sm text-muted-foreground">Staff ID: {selectedStaff?.login_id ?? 'Staff account'}</p>
              {selectedStaff?.phone ? <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Phone className="size-4" /> {selectedStaff.phone}</p> : null}
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Selected for event</Badge>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
            <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-8 place-items-center rounded-lg bg-[#f5ead8] dark:bg-[#33291c]"><MapPin className="size-4 text-primary" /></span> Event destination</CardTitle></CardHeader>
            <CardContent className="space-y-2 p-5">
              <p className="text-lg font-semibold">{job.eventSummary.eventName}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarClock className="size-4" /> {friendlyDate(job.eventSummary.eventDate)} · {friendlyTime(job.eventSummary.eventTime)}</p>
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" /> {job.eventSummary.venue || 'Venue not added'}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#dfc6a4] bg-[#fcfaf7] dark:bg-[#241e17] shadow-level-1">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5ead8] dark:bg-[#33291c] text-primary"><Upload className="size-5" /></span>
              <div>
                <p className="font-semibold">Ticket upload</p>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">Upload the travel ticket for {selectedStaff?.name ?? interest.stylistName}. As soon as it&apos;s uploaded, only this selected staff account is notified in the Stylist Portal and can open it.</p>
              </div>
            </div>

            {plan?.ticketConfirmedAt ? (
              <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{plan.ticketFileName ? <>Ticket <span className="font-medium">&quot;{plan.ticketFileName}&quot;</span> uploaded — stylist notified.</> : 'Confirmed & sent on WhatsApp (no file attached).'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-emerald-700/80">{friendlyDate(plan.ticketConfirmedAt)}</p>
                  {ticketSignedUrl ? (
                    <a href={ticketSignedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800">
                      <FileText className="size-4" /> View ticket
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <form action={uploadTicketAction} className="flex flex-col gap-3 rounded-xl border border-border bg-white dark:bg-card p-4 sm:flex-row sm:items-end">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="interestId" value={interest.id} />
              <label className="block flex-1 text-sm">
                {plan?.ticketFilePath ? 'Replace ticket file (PDF, JPG, PNG or WEBP)' : 'Ticket file (PDF, JPG, PNG or WEBP)'}
                <Input type="file" name="ticket" accept="application/pdf,image/png,image/jpeg,image/webp" required className="mt-1" />
              </label>
              <Button type="submit" className="sm:shrink-0">
                <Upload /> {plan?.ticketFilePath ? 'Upload new ticket' : 'Upload ticket & notify stylist'}
              </Button>
            </form>

            {!plan?.ticketConfirmedAt ? (
              <div className="border-t border-border pt-3">
                <form action={confirmTicketSentAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="interestId" value={interest.id} />
                  <Button type="submit" variant="outline" size="sm">
                    <MessageCircle /> Or just confirm it was sent on WhatsApp (no file)
                  </Button>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </BookingPortalShell>
  );
}
