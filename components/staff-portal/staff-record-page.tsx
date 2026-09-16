import type { ReactNode } from 'react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import { Card, CardContent } from '@/components/ui/card';
import type { StaffSession } from '@/lib/staff-portal/types';

export function StaffRecordPage({ session, title, subtitle, icon, heading, description, children }: { session: StaffSession; title: string; subtitle: string; icon: ReactNode; heading: string; description: string; children?: ReactNode }) {
  return <StaffPortalShell language={session.languagePreference} name={session.name} departments={session.departments} permissions={session.permissions} isMainId={session.isMainId}>
    <div className="mx-auto max-w-[1200px] space-y-6">
      <DashboardHeader title={title} subtitle={subtitle} backHref="/staff-portal" />
      {children ?? <Card className="border-border shadow-level-1"><CardContent className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary [&_svg]:size-5">{icon}</span><h3 className="mt-4 font-semibold">{heading}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div></CardContent></Card>}
    </div>
  </StaffPortalShell>;
}
