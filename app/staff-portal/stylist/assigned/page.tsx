import Link from 'next/link';
import { CalendarClock, CheckCircle2, FileText, MapPin } from 'lucide-react';
import { requireStylistSession } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { assignedJobsForStylist, stylistJobsForMainAccount } from '@/lib/event-jobs/store';
import { unreadCountForSession } from '@/lib/notifications/store';
import { getSignedFileUrl } from '@/lib/storage/client';
import type { StylistExecutionStatus } from '@/lib/event-jobs/types';
import { StylistExecutionControl } from '@/components/staff-portal/stylist-execution-control';
import { StylistJobModal } from '@/components/staff-portal/stylist-job-modal';

export const dynamic = 'force-dynamic';

const TICKET_BUCKET = 'stylist-tickets';

const STATUS_LABEL: Record<StylistExecutionStatus, string> = {
  not_started: 'Not started',
  reached_venue: 'Live event · OTP verified',
  work_started: 'Work in progress',
  work_completed: 'Work done · collection ready',
};

export default async function StylistAssignedEventsPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const session = await requireStylistSession();
  const { job: selectedJobId } = await searchParams;
  const jobs = session.isMainId
    ? await stylistJobsForMainAccount()
    : await assignedJobsForStylist(session.id);
  const activeDepartments = session.departments.filter((grant) => grant.active).map((grant) => grant.department);
  const notificationCount = await unreadCountForSession(session.id, activeDepartments);

  // Signed URLs for any uploaded ticket documents, keyed by interestId. The
  // bucket is private, so this is the only way a stylist ever sees the file --
  // there's no public link, and it's scoped to exactly the assignments shown
  // on this page (i.e. this stylist's own approved events).
  const ticketUrlByInterestId = new Map<string, string>();
  await Promise.all(
    jobs.flatMap((job) => {
      const interest = job.stylistInterests.find((entry) => entry.stylistAccountId === session.id);
      const plan = job.travelPlans.find((entry) => entry.interestId === interest?.id);
      if (!plan?.ticketFilePath || !interest) return [];
      return [
        getSignedFileUrl(TICKET_BUCKET, plan.ticketFilePath).then((url) => {
          if (url) ticketUrlByInterestId.set(interest.id, url);
        }),
      ];
    }),
  );

  return (
    <StaffPortalShell language={session.languagePreference} name={session.name} departments={session.departments} permissions={session.permissions} accessModules={session.accessModules} isMainId={session.isMainId} notificationCount={notificationCount}>
      <div className="mx-auto max-w-[1080px] space-y-6">
        <DashboardHeader title={session.isMainId ? 'All Stylist Events' : 'My Assigned Events'} subtitle={session.isMainId ? 'Overview of every stylist assignment and event status' : 'Approved assignments and clearly marked backup events'} backHref="/staff-portal/stylist" />

        {jobs.length ? (
          <div className="grid gap-4 rounded-2xl border border-[#e2cfb5] bg-[radial-gradient(circle_at_top_left,#fbf4e9_0%,#f6efe5_38%,#f3ede5_100%)] p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3 dark:border-[#493822]">
            {jobs.map((job) => {
              const interest = job.stylistInterests.find((entry) => entry.stylistAccountId === session.id && entry.status === 'approved')
                ?? (session.isMainId ? job.stylistInterests.find((entry) => entry.status === 'approved') : undefined);
              const plan = job.travelPlans.find((entry) => entry.interestId === interest?.id);
              const execution = job.stylistExecutions.find((entry) => entry.stylistAccountId === session.id)
                ?? (session.isMainId ? job.stylistExecutions.find((entry) => entry.stylistAccountId === interest?.stylistAccountId) : undefined);
              const status: StylistExecutionStatus = execution?.status ?? 'not_started';
              const detailsHref = `/staff-portal/stylist/assigned?job=${encodeURIComponent(job.id)}`;
              const rentalQuantity = job.requiredItems.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <Card key={job.id} className="relative min-w-0 gap-0 border-[#e4d2b6] bg-white py-0 shadow-level-1 transition hover:border-primary/35 hover:shadow-level-2 focus-within:border-primary dark:border-[#493822] dark:bg-card">
                  <Link href={detailsHref} className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={`View details for ${job.eventSummary.customerName || job.id}`} />
                  <CardHeader className="min-w-0 space-y-0 px-4 pt-4 pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-primary">{job.id}</span>
                      <Badge variant="outline" className="border-[#dfc6a4] bg-[#f5ead8] text-[10px] text-[#70481c]">Rental</Badge>
                    </div>
                    <CardTitle className="mt-1 min-w-0 break-words text-sm">{job.eventSummary.customerName || 'Customer not added'}</CardTitle>
                    <p className="mt-0.5 truncate text-xs font-medium text-[#70481c]">{job.eventSummary.eventName} · {job.bookingNumber}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#fcfaf7] px-3 py-2.5 text-xs text-muted-foreground dark:bg-[#241e17]">
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" /> {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                        {friendlyTime(job.eventSummary.eventTime)}
                      </span>
                      {job.eventSummary.venue ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" /> {job.eventSummary.venue}
                        </span>
                      ) : null}
                      <span>{rentalQuantity} rental item{rentalQuantity === 1 ? '' : 's'}</span>
                      {session.isMainId ? (
                        <span className="basis-full">
                          Stylists: {job.stylistInterests.filter((entry) => entry.status === 'approved').map((entry) => entry.stylistName).join(', ') || 'Not assigned'}
                        </span>
                      ) : null}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pt-3 pb-4">
                    {plan?.ticketConfirmedAt ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 shrink-0" />
                          {plan.ticketFileName
                            ? 'Your travel ticket has been uploaded.'
                            : 'Your ticket is confirmed and has been sent to you on WhatsApp.'}
                        </span>
                        {interest && ticketUrlByInterestId.get(interest.id) ? (
                          <a
                            href={ticketUrlByInterestId.get(interest.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="relative z-10 inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-emerald-800"
                          >
                            <FileText className="size-4" /> View / download ticket
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Ticket confirmation is pending. You will receive a private notification when it is confirmed.
                      </p>
                    )}

                    <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#eadcc8] pt-3 dark:border-[#493822]">
                      <Link href={detailsHref} className="inline-flex min-h-9 items-center rounded-md border border-border bg-[#fcfaf7] px-3 text-sm font-medium hover:bg-accent dark:bg-card">View details</Link>
                      <div>
                        <Badge
                          variant="outline"
                          className={
                            status === 'work_completed'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : status === 'not_started'
                                ? 'border-stone-200 bg-stone-50 text-stone-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                          }
                        >
                          {STATUS_LABEL[status]}
                        </Badge>
                      </div>
                      {!session.isMainId ? <StylistExecutionControl jobId={job.id} status={status} /> : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-border shadow-level-1">
            <CardContent className="grid min-h-56 place-items-center p-8 text-center">
              <div>
                <p className="font-semibold">No approved assignments yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once admin approves your interest in an event, it will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {selectedJobId ? <StylistJobModal jobId={selectedJobId} closeHref="/staff-portal/stylist/assigned" /> : null}
    </StaffPortalShell>
  );
}
