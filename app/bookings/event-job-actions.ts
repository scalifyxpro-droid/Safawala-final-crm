'use server';

import { syncEventJobs } from '@/lib/event-jobs/store';
import type { ConfirmedBookingSummary } from '@/lib/event-jobs/types';
import { requireUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

type BookingForEventJob = {
  id: number;
  booking_number: string;
  booking_type: string;
  status: string;
  is_quote: boolean;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  paid_amount: number;
  balance_amount: number;
  security_deposit: number;
  payment_status: string;
  booking_items: { item_name: string; quantity: number }[];
};

function databaseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

async function initializeEventJob(userId: string, bookingId: number) {
  const booking = await withUserContext(userId, async (tx) => {
    const rows = await tx.unsafe(
      `
        select b.id, b.booking_number, b.booking_type, b.status, b.is_quote, b.event_name,
          b.event_date, b.event_time, b.event_location, b.total, b.paid_amount, b.balance_amount,
          b.security_deposit, b.payment_status, c.name as customer_name, c.phone as customer_phone,
          coalesce(items.rows, '[]'::json) as booking_items
        from public.bookings b
        left join public.customers c on c.id = b.customer_id
        left join lateral (
          select json_agg(json_build_object('item_name', bi.item_name, 'quantity', bi.quantity)) as rows
          from public.booking_items bi where bi.booking_id = b.id
        ) items on true
        where b.id = $1
      `,
      [bookingId],
    );
    return (rows as unknown as BookingForEventJob[])[0] ?? null;
  });
  if (!booking) throw new Error('Booking not found.');

  if (booking.is_quote || booking.status !== 'confirmed') {
    throw new Error('Only a confirmed booking can create an Event Job.');
  }

  const summary: ConfirmedBookingSummary = {
    bookingId: booking.id,
    bookingNumber: booking.booking_number,
    bookingType: booking.booking_type,
    status: booking.status,
    customerName: booking.customer_name,
    customerPhone: booking.customer_phone,
    eventName: booking.event_name,
    eventDate: databaseDate(booking.event_date),
    eventTime: booking.event_time,
    eventLocation: booking.event_location,
    items: (booking.booking_items ?? []).map((item) => ({
      itemName: item.item_name,
      quantity: item.quantity,
    })),
    payment: {
      totalAmount: Number(booking.total),
      amountReceived: Number(booking.paid_amount),
      pendingBalance: Number(booking.balance_amount),
      depositAmount: Number(booking.security_deposit),
      paymentStatus: booking.payment_status,
    },
  };

  await syncEventJobs([summary]);
}

export async function initializeBookingEventJobAction(bookingId: number) {
  try {
    const user = await requireUser();
    await initializeEventJob(user.id, bookingId);
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Event Job could not be initialized.' };
  }
}

export async function convertQuoteToBookingAction(quoteId: number) {
  const user = await requireUser();
  let bookingId: number;
  try {
    const rows = await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.convert_quote_to_booking($1)`, [quoteId]),
    );
    const created = (rows as unknown as { id: number }[])[0];
    bookingId = Number(created?.id);
  } catch (error) {
    return { id: null, error: error instanceof Error ? error.message : 'Quote could not be converted.' };
  }
  if (!Number.isFinite(bookingId)) {
    return { id: null, error: 'The booking was created without a valid ID.' };
  }

  try {
    await initializeEventJob(user.id, bookingId);
    return { id: bookingId, error: '' };
  } catch (initializationError) {
    // Conversion itself has already committed. Return the booking ID so the
    // caller can show success and open the new booking even if the optional
    // Event Job backfill needs attention.
    return {
      id: bookingId,
      error:
        initializationError instanceof Error
          ? initializationError.message
          : 'The booking was created, but its Event Job could not be initialized.',
    };
  }
}

export async function changeBookingStatusAction(bookingId: number, nextStatus: string) {
  try {
    const user = await requireUser();
    await withUserContext(user.id, (tx) =>
      tx.unsafe(`select * from public.change_booking_status($1, $2)`, [bookingId, nextStatus]),
    );
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Booking status could not be changed.' };
  }
}
