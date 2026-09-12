import 'server-only';

import { withServiceRole } from '@/lib/db/client';

export type AdminNotification = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

type Row = { id: number; title: string; message: string; href: string | null; created_at: string; read_at: string | null };

function toNotification(item: Row): AdminNotification {
  return {
    id: String(item.id),
    title: item.title,
    message: item.message,
    href: item.href,
    createdAt: item.created_at,
    readAt: item.read_at,
  };
}

// Notifications for the account owner / Main ID (e.g. new leads, locked
// dates) — separate from the staff department job notifications in
// lib/notifications/store.ts, which are keyed by department instead of owner.
export async function notificationsForOwner(ownerId: string): Promise<AdminNotification[]> {
  const rows = await withServiceRole((tx) => tx<Row[]>`
    select id, title, message, href, created_at, read_at from public.admin_notifications
    where owner_id = ${ownerId} order by created_at desc limit 100
  `);
  return rows.map(toNotification);
}

export async function unreadCountForOwner(ownerId: string): Promise<number> {
  const [row] = await withServiceRole((tx) => tx<{ count: string }[]>`
    select count(*) as count from public.admin_notifications where owner_id = ${ownerId} and read_at is null
  `);
  return row ? Number(row.count) : 0;
}

export async function markAllReadForOwner(ownerId: string) {
  await withServiceRole((tx) => tx`
    update public.admin_notifications set read_at = now() where owner_id = ${ownerId} and read_at is null
  `);
}
