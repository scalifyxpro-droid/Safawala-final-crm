'use server';

import { withServiceRole } from '@/lib/db/client';

export async function submitBookingFeedbackAction(
  bookingId: number,
  input: { rating: number; experience: string; comment: string; suggestions: string },
): Promise<{ error: string }> {
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { error: 'Please choose a rating from 1 to 5.' };
  }

  try {
    const [booking] = await withServiceRole((tx) =>
      tx`select customer_id from public.bookings where id = ${bookingId}`,
    );
    if (!booking) return { error: 'Booking not found.' };

    await withServiceRole(
      (tx) => tx`
        insert into public.booking_feedback (booking_id, customer_id, rating, experience, comment, suggestions)
        values (
          ${bookingId},
          ${booking.customer_id},
          ${rating},
          ${input.experience?.trim() || null},
          ${input.comment?.trim() || null},
          ${input.suggestions?.trim() || null}
        )
      `,
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save your feedback. Please try again.' };
  }
}
