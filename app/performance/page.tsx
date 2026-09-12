import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Card, CardContent } from '@/components/ui/card';
import { listPerformanceCredits } from '@/lib/performance/store';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const DEPARTMENT_LABEL: Record<string, string> = {
  warehouse: 'Warehouse',
  qc: 'QC & Packing',
  collection: 'Collection',
  stylist: 'Stylist',
  booking: 'Booking',
};

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Step 17 — this is deliberately just the STRUCTURE for future performance
  // reporting, counted only from Event Jobs that have actually been closed (see
  // closeEventJob() in lib/event-jobs/store.ts) so nobody is credited for work still
  // in progress, and never more than once for the same job.
  const credits = await listPerformanceCredits();

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[900px] space-y-6">
        <DashboardHeader
          title="Performance"
          subtitle="Completed-event counts per participant — credited only once an Event Job is closed"
          backHref="/dashboard"
        />

        <Card className="border-border shadow-level-1">
          <CardContent className="p-0">
            {credits.length ? (
              <ul className="divide-y divide-border">
                {credits.map((credit) => (
                  <li key={credit.identifier} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">{credit.name}</p>
                      <p className="text-xs text-muted-foreground">{DEPARTMENT_LABEL[credit.department] ?? credit.department}</p>
                    </div>
                    <p className="font-semibold">{credit.completedJobIds.length} completed event{credit.completedJobIds.length === 1 ? '' : 's'}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                    <Trophy />
                  </span>
                  <h3 className="mt-4 font-semibold">No completed events yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Credit appears here once Booking staff close an Event Job.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BookingPortalShell>
  );
}
