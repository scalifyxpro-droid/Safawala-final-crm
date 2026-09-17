import { withServiceRole } from '@/lib/db/client';
import { sendWhatsAppText, sendWhatsAppDocument } from './session';
import { generateInvoicePdf } from './invoice-pdf';
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
  booking_type: string;
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
        select b.id, b.booking_number, b.booking_type, b.status, b.payment_status, b.event_name, b.event_date,
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
  return (row as { item_name?: string } | undefined)?.item_name ?? 'Safawala Package';
}

type MessageType =
  | 'booking_confirmed'
  | 'invoice'
  | 'payment_received'
  | 'full_payment_completed'
  | 'thank_you_feedback'
  | 'event_reminder_7d'
  | 'event_reminder_1d';

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

/** Same log-then-send contract as safeSend, but for a document (the invoice PDF). */
async function safeSendDocument(
  booking: BookingForNotify,
  type: MessageType,
  caption: string,
  document: Buffer,
  fileName: string,
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
        [booking.id, booking.customer_id, type, booking.customer_phone, caption],
      ),
    );
    logId = (inserted as { id?: number } | undefined)?.id ?? null;
  } catch (err) {
    console.error(`[whatsapp] failed to log ${type} for booking ${booking.id}`, err);
    return;
  }

  try {
    await sendWhatsAppDocument(booking.customer_phone, document, fileName, caption);
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
        bookingType: booking.booking_type,
      });
      await safeSend(booking, 'booking_confirmed', body);
    }

    if (!(await alreadySent(bookingId, 'invoice'))) {
      const caption = templates.invoiceMessage({
        customerName: booking.customer_name,
        bookingNumber: booking.booking_number,
        bookingId: booking.id,
        eventDate: booking.event_date,
        eventLocation: booking.event_location,
        totalAmount: Number(booking.total),
      });
      const pdf = await generateInvoicePdf(bookingId).catch((err) => {
        console.error(`[whatsapp] invoice PDF generation threw for booking ${bookingId}`, err);
        return null;
      });
      if (pdf) {
        await safeSendDocument(booking, 'invoice', caption, pdf.buffer, pdf.fileName);
      } else {
        // PDF generation failed — still let the customer know rather than
        // silently sending nothing.
        await safeSend(booking, 'invoice', caption);
      }
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
      eventDate: booking.event_date,
      eventLocation: booking.event_location,
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
    eventDate: booking.event_date,
    eventLocation: booking.event_location,
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
      bookingNumber: booking.booking_number,
      bookingId: booking.id,
      eventDate: booking.event_date,
      eventLocation: booking.event_location,
    });
    await safeSend(booking, 'thank_you_feedback', body);
  } catch (err) {
    console.error(`[whatsapp] maybeNotifyThankYou failed for booking ${bookingId}`, err);
  }
}

/**
 * Trigger 5/6: event-date reminders. Scans every live (non-draft,
 * non-cancelled) booking for an event date exactly 7 or 1 day(s) away and
 * sends the matching reminder — each is sent at most once per booking via
 * the same public.whatsapp_messages dedupe used by every other trigger
 * here. Meant to be called periodically (see instrumentation.ts), not from
 * a specific booking/payment action.
 */
export async function checkAndSendEventReminders(): Promise<void> {
  let dueBookings: { id: number; days_out: number }[] = [];
  try {
    dueBookings = (await withServiceRole((tx) =>
      tx.unsafe(
        `
          select b.id, (b.event_date - current_date) as days_out
          from public.bookings b
          where b.status not in ('draft', 'cancelled')
            and (b.event_date - current_date) in (7, 1)
        `,
      ),
    )) as unknown as { id: number; days_out: number }[];
  } catch (err) {
    console.error('[whatsapp] checkAndSendEventReminders failed to query due bookings', err);
    return;
  }

  for (const due of dueBookings) {
    const type: MessageType = due.days_out === 7 ? 'event_reminder_7d' : 'event_reminder_1d';
    try {
      if (await alreadySent(due.id, type)) continue;
      const booking = await fetchBooking(due.id);
      if (!booking) continue;
      const packageName = await firstItemName(due.id);
      const body =
        type === 'event_reminder_7d'
          ? templates.eventReminder7DaysMessage({
              customerName: booking.customer_name,
              bookingNumber: booking.booking_number,
              eventDate: booking.event_date,
              eventLocation: booking.event_location,
              packageName,
            })
          : templates.eventReminder1DayMessage({
              customerName: booking.customer_name,
              bookingNumber: booking.booking_number,
              eventDate: booking.event_date,
              eventLocation: booking.event_location,
              packageName,
            });
      await safeSend(booking, type, body);
    } catch (err) {
      console.error(`[whatsapp] event reminder failed for booking ${due.id}`, err);
    }
  }
}
