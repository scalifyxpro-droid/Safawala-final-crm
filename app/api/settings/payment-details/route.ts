import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';
import type { PublicBankDetails } from '@/lib/settings/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const bank = await withUserContext(user.id, async (tx) => {
      const [context] = await tx<{ owner_id: string | null }[]>`
        select public.current_booking_owner() as owner_id
      `;
      if (!context?.owner_id) return null;
      const [row] = await tx<{
        bank_name: string;
        account_holder_name: string;
        account_number: string;
        ifsc_code: string;
        branch_name: string | null;
        upi_id: string | null;
        qr_code_image: string | null;
      }[]>`
        select bank_name, account_holder_name, account_number, ifsc_code,
          branch_name, upi_id, qr_code_image
        from public.bank_accounts
        where owner_id = ${context.owner_id}
        order by is_primary desc, created_at asc
        limit 1
      `;
      return row ?? null;
    });

    const details: PublicBankDetails | null = bank ? {
      bank: bank.bank_name,
      accountHolder: bank.account_holder_name,
      accountNumber: bank.account_number,
      ifsc: bank.ifsc_code,
      branch: bank.branch_name ?? '',
      upi: bank.upi_id ?? '',
      qrCodeImage: bank.qr_code_image,
    } : null;
    return NextResponse.json({ data: details }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Payment settings are temporarily unavailable.' }, { status: 503 });
  }
}
