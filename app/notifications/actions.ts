'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { markAllReadForOwner } from '@/lib/notifications/admin-store';

export async function markAllAdminNotificationsReadAction() {
  const user = await requireUser();
  await markAllReadForOwner(user.id);
  revalidatePath('/notifications');
  revalidatePath('/dashboard');
}
