import { withServiceRole } from '@/lib/db/client';
import { sendWhatsAppText } from './session';
import * as templates from './templates';

/**
 * Guarded triggers for the WhatsApp Customer Automation. Every exported
 * function here is safe to call from anywhere in the booking/payment flow:
 * it never throws, it re-reads the booking fresh from the database (so it
 * can't act on stale data), and it checks public.whatsapp_messages before
 * sending so the same automatic message is never sent twice for the same
 * booking.
 */

type BookingForNotify = {
  id: number;
  booking_number: string;
  status: string;
  payment_status: string;
  event_name: string;
  event_date: string;
  event_location: string | null;
  total: number;
  paid_amount: number;
  balance_amount: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
};

async function fetchBooking(bookingId: number): Promise<BookingForNotify | null> {
  const [row] = await withServiceRole((tx) =>
    tx.unsafe(
      `
        select b.id, b.booking_number, b.status, b.payment_status, b.event_name, b.event_date,
          b.event_location, b.total, b.paid_amount, b.balance_amount, b.customer_id,
          c.name as customer_name, c.phone as customer_phone
        from public.bookings b
        join public.customers c on c.id = b.customer_id
        where b.id = $1
      `,
      [bookingId],
    ),
  );
  return (row as unknown as BookingForNotify) ?? null;
}

/** Package/service label shown in the booking-confirmed message. */
async function firstItemName(bookingId: number): Promise<string> {
  const [row] = await withServiceRole((tx) =>
    tx.unsafe(
      `select item_name from public.booking_items where booking_id = $1 order by id limit 1`,
      [bookingId],
    ),
  );
  return (row as { item_name?: string } | undefined)?.item_name ?? 'SafaWala Package';
}

type MessageType =
  | 'booking_confirmed'
  | 'invoice'
  | 'payment_received'
  | 'full_payment_completed'
  | 'thank_you_feedback';

async function alreadySent(bookingId: number, type: MessageType): Promise<boolean> {
  const [row] = await withServiceRole((tx) =>
    tx.unsafe(
      `select 1 from public.whatsapp_messages where booking_id = $1 and message_type = $2 and status = 'sent' limit 1`,
      [bookingId, type],
    ),
  );
  return Boolean(row);
}

async function safeSend(
  booking: BookingForNotify,
  type: MessageType,
  body: string,
): Promise<void> {
  let logId: number | null = null;
  try {
    const [inserted] = await withServiceRole((tx) =>
      tx.unsafe(
        `
          insert into public.whatsapp_messages (booking_id, customer_id, message_type, to_number, body, status)
          values ($1, $2, $3, $4, $5, 'pending')
          returning id
        `,
        [booking.id, booking.customer_id, type, booking.customer_phone, body],
      ),
    );
    logId = (inserted as { id?: number } | undefined)?.id ?? null;
  } catch (err) {
    console.error(`[whatsapp] failed to log ${type} for booking ${booking.id}`, err);
    return;
  }

  try {
    await sendWhatsAppText(booking.customer_phone, body);
    if (logId) {
      await withServiceRole(
        (tx) => tx`update public.whatsapp_messages set status = 'sent', sent_at = now() where id = ${logId}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[whatsapp] send failed (${type}, booking ${booking.id})`, err);
    if (logId) {
      await withServiceRole(
        (tx) => tx`update public.whatsapp_messages set status = 'failed', error = ${message} where id = ${logId}`,
      ).catch(() => {});
    }
  }
}

/** Trigger 1 (+ bundled invoice send): booking status becomes 'confirmed'. */
export async function notifyBookingConfirmed(bookingId: number): Promise<void> {
  try {
    const booking = await fetchBooking(bookingId);
    if (!booking || booking.status !== 'confirmed') return;

    if (!(await alreadySent(bookingId, 'booking_confirmed'))) {
      const packageName = await firstItemName(bookingId);
      const body = templates.bookingConfirmedMessage({
        customerName: booking.customer_name,
        bookingNumber: booking.booking_number,
        eventDate: booking.event_date,
        eventLocation: booking.event_location,
        packageName,
        bookingId: booking.id,
      });
      await safeSend(booking, 'booking_confirmed', body);
    }

    if (!(await alreadySent(bookingId, 'invoice'))) {
      const body = templates.invoiceMessage({
        customerName: booking.customer_name,
        bookingNumber: booking.booking_number,
        bookingId: booking.id,
      });
      await safeSend(booking, 'invoice', body);
    }
  } catch (err) {
    console.error(`[whatsapp] notifyBookingConfirmed failed for booking ${bookingId}`, err);
  }
}

/** Trigger 2: a payment was just recorded against the booking. */
export async function notifyPaymentReceived(bookingId: number, paymentAmount: number): Promise<void> {
  try {
    const booking = await fetchBooking(bookingId);
    if (!booking) return;

    const body = templates.paymentReceivedMessage({
      customerName: booking.customer_name,
      bookingNumber: booking.booking_number,
      paymentAmount,
      totalPaid: Number(booking.paid_amount),
      remainingAmount: Number(booking.balance_amount),
    });
    await safeSend(booking, 'payment_received', body);

    if (Number(booking.total) > 0 && Number(booking.balance_amount) <= 0) {
      await notifyFullPaymentCompleted(booking);
    }
  } catch (err) {
    console.error(`[whatsapp] notifyPaymentReceived failed for booking ${bookingId}`, err);
  }
}

/** Trigger 3: balance has hit zero (called only from notifyPaymentReceived above). */
async function notifyFullPaymentCompleted(booking: BookingForNotify): Promise<void> {
  if (await alreadySent(booking.id, 'full_payment_completed')) return;
  const body = templates.fullPaymentCompletedMessage({
    customerName: booking.customer_name,
    bookingNumber: booking.booking_number,
    totalPaid: Number(booking.paid_amount),
  });
  await safeSend(booking, 'full_payment_completed', body);
  await maybeNotifyThankYou(booking.id, booking);
}

/**
 * Trigger 4: thank-you + feedback. Fires only once both conditions hold —
 * balance is fully paid AND the booking's status is 'completed' — whichever
 * of the two events (final payment, or event completion) happens last.
 * Safe to call speculatively from either place; it no-ops until both are true.
 */
export async function maybeNotifyThankYou(
  bookingId: number,
  preloaded?: BookingForNotify,
): Promise<void> {
  try {
    const booking = preloaded ?? (await fetchBooking(bookingId));
    if (!booking) return;
    if (Number(booking.balance_amount) > 0) return;
    if (booking.status !== 'completed') return;
    if (await alreadySent(bookingId, 'thank_you_feedback')) return;

    const body = templates.thankYouFeedbackMessage({
      customerName: booking.customer_name,
      bookingId: booking.id,
    });
    await safeSend(booking, 'thank_you_feedback', body);
  } catch (err) {
    console.error(`[whatsapp] maybeNotifyThankYou failed for booking ${bookingId}`, err);
  }
}
