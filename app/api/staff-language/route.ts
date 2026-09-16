import { NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-portal/session';
import { withUserContext } from '@/lib/db/client';

const supported = new Set(['en', 'hi', 'gu']);

export async function POST(request: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let language: unknown;
  try {
    ({ language } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof language !== 'string' || !supported.has(language)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
  }

  try {
    const rows = await withUserContext(session.id, (tx) => tx<{ language_preference: string }[]>`
      update public.profiles
      set language_preference = ${language}
      where id = ${session.id} and role = 'staff'
      returning language_preference
    `);
    if (rows.length !== 1) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json({ language: rows[0].language_preference });
  } catch {
    return NextResponse.json({ error: 'Could not save language preference' }, { status: 503 });
  }
}
