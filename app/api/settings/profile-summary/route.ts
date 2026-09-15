import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const [profile] = await withUserContext(user.id, (tx) => tx<{ full_name: string | null; avatar_url: string | null; designation: string | null }[]>`
      select full_name, avatar_url, designation from public.profiles where id = ${user.id}
    `);
    return NextResponse.json({
      data: {
        name: profile?.full_name || (user.role === 'admin' ? 'Safawala Admin' : user.email),
        avatarUrl: profile?.avatar_url ? '/api/settings/profile-avatar' : null,
        designation: profile?.designation ?? null,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ data: null }, { status: 503 });
  }
}
