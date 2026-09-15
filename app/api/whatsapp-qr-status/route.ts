import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getSessionStatus, startWhatsAppSession } from '@/lib/whatsapp/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Cheap to call repeatedly — startWhatsAppSession() no-ops once connected
  // or already connecting, so this also nudges a disconnected session back
  // to life if the admin opens this page after an unexpected drop.
  startWhatsAppSession().catch(() => {});

  return NextResponse.json(getSessionStatus());
}
