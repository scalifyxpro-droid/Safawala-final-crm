import { redirect } from 'next/navigation';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { EventTrackingList } from '@/components/staff-portal/event-tracking-list';
import { getCurrentUser } from '@/lib/auth/session';
import { listJobs } from '@/lib/event-jobs/store';

export const dynamic = 'force-dynamic';

export default async function AdminJobTrackingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const jobs = await listJobs();

  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[1440px] space-y-5">
        <DashboardHeader
          title="Job Tracking"
          subtitle="Monitor the current progress of every confirmed event"
          backHref="/dashboard"
        />
        <EventTrackingList jobs={jobs} />
      </div>
    </DashboardShell>
  );
}
