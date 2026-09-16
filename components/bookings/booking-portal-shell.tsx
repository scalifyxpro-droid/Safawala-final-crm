import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { getStaffSession } from '@/lib/staff-portal/session';
import { unreadCountForOwner } from '@/lib/notifications/admin-store';
import { getCurrentUser } from '@/lib/auth/session';

export async function BookingPortalShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const staffSession = await getStaffSession();

  if (staffSession) {
    return (
      <StaffPortalShell
        language={staffSession.languagePreference}
        name={staffSession.name}
        departments={staffSession.departments}
        accessModules={staffSession.accessModules}
        permissions={staffSession.permissions}
        isMainId={staffSession.isMainId}
        portalKind={staffSession.portalKind}
      >
        {children}
      </StaffPortalShell>
    );
  }

  // Best-effort: if the Leads Center migration hasn't been applied yet,
  // admin_notifications won't exist — fall back to 0 rather than breaking
  // every page in the app over a missing notifications count.
  let notificationCount = 0;
  try {
    const user = await getCurrentUser();
    if (user) notificationCount = await unreadCountForOwner(user.id);
  } catch {
    notificationCount = 0;
  }

  return (
    <DashboardShell email={email} notificationCount={notificationCount}>
      {children}
    </DashboardShell>
  );
}
