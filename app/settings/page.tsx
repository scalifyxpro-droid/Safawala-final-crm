import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import {
  SettingsPanel,
  type DocumentNumberSetting,
} from '@/components/settings/settings-panel';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let data: DocumentNumberSetting[] = [];
  let loadError = '';
  try {
    data = await withUserContext(user.id, (tx) => tx<DocumentNumberSetting[]>`
      select series, prefix, next_number, number_padding, sequence_year
      from public.document_number_settings
      order by series
    `);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load document numbering settings.';
  }

  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <SettingsPanel
        currentEmail={user.email ?? ''}
        initialSettings={data}
        loadError={loadError}
      />
    </DashboardShell>
  );
}
