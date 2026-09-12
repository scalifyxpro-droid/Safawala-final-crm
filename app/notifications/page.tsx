import { redirect } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import { BookingPortalShell } from '@/components/bookings/booking-portal-shell';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { friendlyDate } from '@/lib/bookings';
import { getCurrentUser } from '@/lib/auth/session';
import { getStaffSession } from '@/lib/staff-portal/session';
import { notificationsForOwner, unreadCountForOwner } from '@/lib/notifications/admin-store';
import { markAllAdminNotificationsReadAction } from '@/app/notifications/actions';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const staffSession = await getStaffSession();
  if (staffSession) redirect('/staff-portal/notifications');

  let notifications: Awaited<ReturnType<typeof notificationsForOwner>> = [];
  let unreadCount = 0;
  let loadError = '';
  try {
    [notifications, unreadCount] = await Promise.all([
      notificationsForOwner(user.id),
      unreadCountForOwner(user.id),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load notifications.';
  }

  return (
    <BookingPortalShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[900px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DashboardHeader title="Notifications" subtitle="Updates about leads, locked dates and your account" backHref="/dashboard" />
          {unreadCount > 0 ? (
            <form action={markAllAdminNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null}
        </div>

        {loadError ? (
          <Card className="border-red-200 bg-red-50 text-red-700 shadow-level-1">
            <CardContent className="p-4 text-sm">{loadError}</CardContent>
          </Card>
        ) : (
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
                        <p className={item.readAt ? 'text-muted-foreground' : 'font-medium'}>{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.message}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{friendlyDate(item.createdAt)}</p>
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
                      Updates about new leads and locked dates will show up here.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </BookingPortalShell>
  );
}
