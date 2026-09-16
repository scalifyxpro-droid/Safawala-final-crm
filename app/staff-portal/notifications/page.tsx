import { Bell, BellOff } from 'lucide-react';
import { requireStaffSession } from '@/lib/staff-portal/guard';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate } from '@/lib/bookings';
import { notificationsForSession, unreadCountForSession } from '@/lib/notifications/store';
import { markAllNotificationsReadAction } from '@/app/staff-portal/notifications/actions';

export const dynamic = 'force-dynamic';

export default async function StaffNotificationsPage() {
  const session = await requireStaffSession();
  const activeDepartments = session.departments.filter((grant) => grant.active).map((grant) => grant.department);
  const notifications = (await notificationsForSession(session.id, activeDepartments)).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  const unreadCount = await unreadCountForSession(session.id, activeDepartments);

  return (
    <StaffPortalShell language={session.languagePreference} name={session.name} departments={session.departments} permissions={session.permissions} isMainId={session.isMainId} notificationCount={unreadCount}>
      <div className="mx-auto max-w-[900px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DashboardHeader title="Notifications" subtitle="Updates about jobs in your departments" />
          {unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null}
        </div>

        <Card className="border-border shadow-level-1">
          <CardContent className="p-0">
            {notifications.length ? (
              <ul className="divide-y divide-border">
                {notifications.map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-start gap-3 p-4 text-sm ${item.readAt ? '' : 'bg-[#fcfaf7] dark:bg-[#241e17]'}`}
                  >
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent text-primary">
                      <Bell className="size-4" />
                    </span>
                    <div>
                      <p className={item.readAt ? 'text-muted-foreground' : 'font-medium'}>{item.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.jobId} · {friendlyDate(item.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                    <BellOff />
                  </span>
                  <h3 className="mt-4 font-semibold">No notifications yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Updates about your department&apos;s jobs will show up here.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffPortalShell>
  );
}
