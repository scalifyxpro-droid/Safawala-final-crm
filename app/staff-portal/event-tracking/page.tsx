import { DashboardHeader } from '@/components/layout/dashboard-header';
import { EventTrackingList } from '@/components/staff-portal/event-tracking-list';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { listJobs } from '@/lib/event-jobs/store';
import { requireStaffSession } from '@/lib/staff-portal/guard';

export const dynamic = 'force-dynamic';

export default async function EventTrackingPage() {
  const [session, jobs] = await Promise.all([
    requireStaffSession(),
    listJobs(),
  ]);
  return (
    <StaffPortalShell language={session.languagePreference}
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      isMainId={session.isMainId}
    >
      <div className="mx-auto max-w-[1440px] space-y-5">
        <DashboardHeader
          title="Event Tracking"
          subtitle="Check the current progress of every confirmed event"
        />
        <EventTrackingList jobs={jobs} />
      </div>
    </StaffPortalShell>
  );
}
