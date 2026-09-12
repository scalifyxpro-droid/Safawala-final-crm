import { CalendarClock, CheckCircle2, FileText, MapPin } from 'lucide-react';
import { requireStylistSession } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { assignedJobsForStylist, stylistJobsForMainAccount } from '@/lib/event-jobs/store';
import { unreadCountForSession } from '@/lib/notifications/store';
import { getSignedFileUrl } from '@/lib/storage/client';
import type { ExecutionAction } from '@/lib/event-jobs/store';
import type { StylistExecutionStatus } from '@/lib/event-jobs/types';
import { recordExecutionAction } from '@/app/staff-portal/stylist/execution-actions';

export const dynamic = 'force-dynamic';

const TICKET_BUCKET = 'stylist-tickets';

const NEXT_ACTION: Record<StylistExecutionStatus, { action: ExecutionAction; label: string } | null> = {
  not_started: { action: 'reached_venue', label: 'Reached Venue' },
  reached_venue: { action: 'start_work', label: 'Start Work' },
  work_started: { action: 'complete_work', label: 'Complete Work' },
  work_completed: null,
};

const STATUS_LABEL: Record<StylistExecutionStatus, string> = {
  not_started: 'Not started',
  reached_venue: 'Reached venue',
  work_started: 'Work in progress',
  work_completed: 'Event completed',
};

export default async function StylistAssignedEventsPage() {
  const session = await requireStylistSession();
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
    <StaffPortalShell name={session.name} departments={session.departments} permissions={session.permissions} accessModules={session.accessModules} isMainId={session.isMainId} notificationCount={notificationCount}>
      <div className="mx-auto max-w-[1080px] space-y-6">
        <DashboardHeader title={session.isMainId ? 'All Stylist Events' : 'My Assigned Events'} subtitle={session.isMainId ? 'Overview of every stylist assignment and event status' : 'Approved assignments and clearly marked backup events'} backHref="/staff-portal/stylist" />

        {jobs.length ? (
          <div className="space-y-6">
            {jobs.map((job) => {
              const interest = job.stylistInterests.find((entry) => entry.stylistAccountId === session.id && entry.status === 'approved')
                ?? (session.isMainId ? job.stylistInterests.find((entry) => entry.status === 'approved') : undefined);
              const plan = job.travelPlans.find((entry) => entry.interestId === interest?.id);
              const execution = job.stylistExecutions.find((entry) => entry.stylistAccountId === session.id)
                ?? (session.isMainId ? job.stylistExecutions.find((entry) => entry.stylistAccountId === interest?.stylistAccountId) : undefined);
              const status: StylistExecutionStatus = execution?.status ?? 'not_started';
              const next = NEXT_ACTION[status];

              return (
                <Card key={job.id} className="border-border shadow-level-1">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{job.eventSummary.customerName || 'Customer not added'}</CardTitle>
                      <p className="mt-0.5 text-sm text-muted-foreground">{job.eventSummary.eventName}</p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-[#70481c]">
                        Customer: {job.eventSummary.customerName || 'Customer not added'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" /> {friendlyDate(job.eventSummary.eventDate)} ·{' '}
                        {friendlyTime(job.eventSummary.eventTime)}
                      </span>
                      {job.eventSummary.venue ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" /> {job.eventSummary.venue}
                        </span>
                      ) : null}
                      {session.isMainId ? (
                        <span className="basis-full text-xs text-muted-foreground">
                          Stylists: {job.stylistInterests.filter((entry) => entry.status === 'approved').map((entry) => entry.stylistName).join(', ') || 'Not assigned'}
                        </span>
                      ) : null}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {plan?.ticketConfirmedAt ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 sm:flex-row sm:items-center sm:justify-between">
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
                            className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-emerald-800"
                          >
                            <FileText className="size-4" /> View / download ticket
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Ticket confirmation is pending. You will receive a private notification when it is confirmed.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Event-day status</p>
                        <Badge
                          variant="outline"
                          className={
                            status === 'work_completed'
                              ? 'mt-1 border-emerald-200 bg-emerald-50 text-emerald-700'
                              : status === 'not_started'
                                ? 'mt-1 border-stone-200 bg-stone-50 text-stone-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
                                : 'mt-1 border-amber-200 bg-amber-50 text-amber-800'
                          }
                        >
                          {STATUS_LABEL[status]}
                        </Badge>
                      </div>
                      {next ? (
                        <form action={recordExecutionAction} className="flex items-center gap-2">
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="action" value={next.action} />
                          <Button type="submit" size="sm">
                            {next.label}
                          </Button>
                        </form>
                      ) : null}
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
    </StaffPortalShell>
  );
}
