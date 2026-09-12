'use server';

import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

export type ModificationActivity = {
  id: number;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

export async function logModificationActivityAction(
  bookingId: number,
  action: string,
): Promise<{ data: ModificationActivity | null; error: string }> {
  try {
    const user = await requireUser();
    const record = await withUserContext(user.id, async (tx) => {
      const [row] = await tx<ModificationActivity[]>`
        insert into public.booking_activity (owner_id, booking_id, action, details)
        values (${user.id}, ${bookingId}, ${action}, ${tx.json({ source: 'modification_portal' })})
        returning id, action, details, created_at
      `;
      return row ?? null;
    });
    return { data: record, error: '' };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Activity could not be recorded.',
    };
  }
}
