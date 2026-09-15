import { redirect } from 'next/navigation';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { WhatsAppQrStatusPanel } from '@/components/whatsapp/qr-status-panel';

export const dynamic = 'force-dynamic';

export default async function WhatsAppQrPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <div className="mx-auto max-w-[640px] space-y-5">
        <DashboardHeader
          title="WhatsApp Connection"
          subtitle="One-time setup to link SafaWala's WhatsApp number for automatic customer messages"
          backHref="/dashboard"
        />
        <WhatsAppQrStatusPanel />
      </div>
    </DashboardShell>
  );
}
