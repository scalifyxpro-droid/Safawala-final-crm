import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { CalendarClock, MapPin, PackageCheck, UsersRound } from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { StylistInterestButton } from '@/components/staff-portal/stylist-interest-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { stylistJobForAccount } from '@/lib/event-jobs/store';
import type { StylistInterestStatus } from '@/lib/event-jobs/types';
import { unreadCountForSession } from '@/lib/notifications/store';
import { requireStylistSession } from '@/lib/staff-portal/guard';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<StylistInterestStatus, string> = {
  interested: 'Under review',
  approved: 'Assigned',
  rejected: 'Not selected · assignment closed',
  backup: 'Backup',
};

const STATUS_TONE: Record<StylistInterestStatus, string> = {
  interested: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-stone-200 bg-stone-50 text-stone-600',
  backup: 'border-sky-200 bg-sky-50 text-sky-700',
};

export default async function StylistEventDetailsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireStylistSession();
  const { jobId } = await params;
  const job = await stylistJobForAccount(jobId, session.id);
  if (!job) notFound();

  const myInterest = job.stylistInterests.find((interest) => interest.stylistAccountId === session.id);
  const interestedCount = job.stylistInterests.filter((interest) => interest.status === 'interested').length;
  const rentalQuantity = job.requiredItems.reduce((sum, item) => sum + item.quantity, 0);
  const activeDepartments = session.departments.filter((grant) => grant.active).map((grant) => grant.department);
  const notificationCount = await unreadCountForSession(session.id, activeDepartments);

  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      notificationCount={notificationCount}
    >
      <div className="mx-auto max-w-[920px] space-y-5">
        <DashboardHeader title={job.eventSummary.customerName || 'Customer not added'} subtitle={`${job.eventSummary.eventName} · Rental event details`} backHref="/staff-portal/stylist" />

        <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1">
          <CardHeader className="border-b border-[#e8dccb] bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge variant="outline" className="border-[#dfc6a4] bg-[#f5ead8] text-[#70481c]">Rental</Badge>
                <CardTitle className="mt-2">Useful event information</CardTitle>
              </div>
              {myInterest ? <Badge variant="outline" className={STATUS_TONE[myInterest.status]}>{STATUS_LABEL[myInterest.status]}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            <Detail icon={<CalendarClock />} label="Date and time" value={`${friendlyDate(job.eventSummary.eventDate)} · ${friendlyTime(job.eventSummary.eventTime)}`} />
            <Detail icon={<MapPin />} label="Location" value={job.eventSummary.venue || 'Venue to be confirmed'} />
            <Detail icon={<PackageCheck />} label="Rental quantity" value={`${rentalQuantity} items`} />
            <Detail icon={<UsersRound />} label="Stylist requirement" value={`${job.stylistsRequiredCount} required · ${interestedCount} interested`} />
          </CardContent>
        </Card>

        {!myInterest ? (
          <Card className="border-[#e4d2b6] bg-[#fffaf2] shadow-level-1">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">Available for this event?</p><p className="mt-1 text-sm text-muted-foreground">Submit once. Admin will review all interested stylists.</p></div>
              <StylistInterestButton jobId={job.id} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </StaffPortalShell>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-white dark:bg-card p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#f5ead8] text-primary [&_svg]:size-4">{icon}</span>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>
    </div>
  );
}
