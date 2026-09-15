import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import {
  SettingsPanel,
  type DocumentNumberSetting,
} from '@/components/settings/settings-panel';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import type { BankAccount, ProfileSettings } from '@/lib/settings/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/staff-portal');

  let data: DocumentNumberSetting[] = [];
  let profile: ProfileSettings = {
    full_name: '',
    avatar_url: null,
    phone: null,
    designation: null,
    department: null,
    employee_id: null,
    date_of_joining: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    language_preference: 'en',
  };
  let bankAccounts: BankAccount[] = [];
  let loadError = '';
  try {
    const result = await withUserContext(user.id, async (tx) => {
      const settings = await tx<DocumentNumberSetting[]>`
        select series, prefix, next_number, number_padding, sequence_year
        from public.document_number_settings
        order by series
      `;
      const [savedProfile] = await tx<ProfileSettings[]>`
        select full_name, avatar_url, phone, designation, department, employee_id,
          date_of_joining::text, emergency_contact_name, emergency_contact_phone,
          language_preference
        from public.profiles where id = ${user.id}
      `;
      const banks = await tx<BankAccount[]>`
        select id, bank_name, account_holder_name, account_number, ifsc_code,
          branch_name, upi_id, qr_code_image, is_primary, created_at
        from public.bank_accounts
        order by is_primary desc, created_at desc
      `;
      return { settings, savedProfile, banks };
    });
    data = result.settings;
    profile = result.savedProfile ?? profile;
    bankAccounts = result.banks;
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load settings from the database.';
  }

  return (
    <DashboardShell email={user.email ?? 'Safawala user'}>
      <SettingsPanel
        currentEmail={user.email ?? ''}
        initialSettings={data}
        initialProfile={profile}
        initialBankAccounts={bankAccounts}
        loadError={loadError}
      />
    </DashboardShell>
  );
}
