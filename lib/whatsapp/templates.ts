/**
 * Message copy for the WhatsApp Customer Automation. Intentionally plain
 * functions (not a database-editable template system) — this was built as
 * automatic, invisible automation wired straight into the booking/payment
 * flow, not as an admin-facing module.
 *
 * Formatting uses WhatsApp's own markdown (*bold text*) so labels stand
 * out in the chat, and every message ends with the same warm SafaWala
 * sign-off for a consistent, professional feel.
 */

function siteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  // Falls back to a relative-looking placeholder rather than throwing —
  // sending a message with a broken link is better than not sending at
  // all, and this is easy to spot and fix by setting NEXT_PUBLIC_SITE_URL.
  return '';
}

export function trackingLink(bookingId: number): string {
  return `${siteBaseUrl()}/track/${bookingId}`;
}

export function feedbackLink(bookingId: number): string {
  return `${siteBaseUrl()}/feedback/${bookingId}`;
}

function formatDate(value: string | Date | null): string {
  if (!value) return 'TBD';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function bookingConfirmedMessage(params: {
  customerName: string;
  bookingNumber: string;
  eventDate: string | Date | null;
  eventLocation: string | null;
  packageName: string;
  bookingId: number;
}): string {
  return `*Booking Confirmed – SafaWala* ❤️

Dear ${params.customerName},

Thank you for choosing SafaWala! Your booking has been successfully confirmed.

*Booking ID:* ${params.bookingNumber}
*Event Date:* ${formatDate(params.eventDate)}
*Event Location:* ${params.eventLocation || 'TBD'}
*Package/Service:* ${params.packageName}

You can track your event status anytime here:
${trackingLink(params.bookingId)}

We are excited to be a part of your special occasion.
Thank you for choosing SafaWala. We look forward to serving you! 🙏`;
}

/** Caption sent alongside the invoice PDF document (see lib/whatsapp/invoice-pdf.ts). */
export function invoiceMessage(params: {
  customerName: string;
  bookingNumber: string;
  bookingId: number;
}): string {
  return `*Invoice – SafaWala* 🧾

Dear ${params.customerName}, please find your invoice for booking *${params.bookingNumber}* attached above.

Thank you for choosing SafaWala!`;
}

export function paymentReceivedMessage(params: {
  customerName: string;
  bookingNumber: string;
  paymentAmount: number;
  totalPaid: number;
  remainingAmount: number;
}): string {
  return `*Payment Received – SafaWala* ✅

Dear ${params.customerName},

We have received your payment of *₹${formatMoney(params.paymentAmount)}* for booking *${params.bookingNumber}*.

*Total Paid:* ₹${formatMoney(params.totalPaid)}
*Remaining Amount:* ₹${formatMoney(params.remainingAmount)}

Thank you,
SafaWala`;
}

export function fullPaymentCompletedMessage(params: {
  customerName: string;
  bookingNumber: string;
  totalPaid: number;
}): string {
  return `*Payment Completed – SafaWala* 🎉

Dear ${params.customerName},

Your payment for booking *${params.bookingNumber}* is now fully completed.

*Total Paid:* ₹${formatMoney(params.totalPaid)}

Thank you for your trust in SafaWala!`;
}

export function thankYouFeedbackMessage(params: {
  customerName: string;
  bookingId: number;
}): string {
  return `*Thank You – SafaWala* ❤️

Dear ${params.customerName},

We truly appreciate your trust in us and hope you enjoyed our service.

We would love to hear about your experience.

⭐ Share your feedback:
${feedbackLink(params.bookingId)}

Your feedback helps us improve and serve you better.
Thank you once again, and we look forward to serving you again! 🙏`;
}
