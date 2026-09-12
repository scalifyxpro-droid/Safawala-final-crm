import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { notificationsForOwner, unreadCountForOwner } from '@/lib/notifications/admin-store';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 }, { status: 401 });
  try {
    const [notifications, unreadCount] = await Promise.all([notificationsForOwner(user.id), unreadCountForOwner(user.id)]);
    return NextResponse.json({ notifications: notifications.slice(0, 5), unreadCount });
  } catch {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}
