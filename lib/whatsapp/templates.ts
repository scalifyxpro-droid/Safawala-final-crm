/**
 * Message copy for the WhatsApp Customer Automation. Intentionally plain
 * functions (not a database-editable template system) — this was built as
 * automatic, invisible automation wired straight into the booking/payment
 * flow, not as an admin-facing module.
 *
 * Plain text on purpose (no WhatsApp bold markdown, no emoji) — this wording
 * was reviewed and approved as-is.
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
  /** Rental bookings get a tracking link; sale bookings never do — there is nothing to track. */
  bookingType: string;
}): string {
  const isRental = params.bookingType === 'rental';
  const trackingBlock = isRental
    ? `\n\nTrack Your Booking:\n${trackingLink(params.bookingId)}`
    : '';
  return `Booking Confirmed – Safawala

Dear ${params.customerName},

Your booking with Safawala has been successfully confirmed.

Booking ID: ${params.bookingNumber}
Event Date: ${formatDate(params.eventDate)}
Event Location: ${params.eventLocation || 'TBD'}
Package: ${params.packageName}${trackingBlock}

We're delighted to be a part of your special occasion and look forward to making it memorable.

Thank you for choosing Safawala.`;
}

/** Caption sent alongside the invoice PDF document (see lib/whatsapp/invoice-pdf.ts). */
export function invoiceMessage(params: {
  customerName: string;
  bookingNumber: string;
  bookingId: number;
}): string {
  return `Invoice – Safawala

Dear ${params.customerName},

Please find your invoice for Booking ${params.bookingNumber} attached with this message.

For any assistance regarding your invoice, please feel free to contact us.

Thank you for choosing Safawala.`;
}

export function paymentReceivedMessage(params: {
  customerName: string;
  bookingNumber: string;
  paymentAmount: number;
  totalPaid: number;
  remainingAmount: number;
}): string {
  return `Payment Received – Safawala

Dear ${params.customerName},

We're pleased to confirm that we have received your payment of ₹${formatMoney(params.paymentAmount)} for Booking ${params.bookingNumber}.

Total Paid: ₹${formatMoney(params.totalPaid)}
Remaining Amount: ₹${formatMoney(params.remainingAmount)}

Thank you for your payment and for choosing Safawala.`;
}

export function fullPaymentCompletedMessage(params: {
  customerName: string;
  bookingNumber: string;
  totalPaid: number;
}): string {
  return `Payment Completed – Safawala

Dear ${params.customerName},

Your payment for Booking ${params.bookingNumber} has been completed successfully.

Total Amount Paid: ₹${formatMoney(params.totalPaid)}
Balance: ₹0

Thank you for your trust in Safawala. We look forward to being a part of your special occasion.`;
}

export function thankYouFeedbackMessage(params: {
  customerName: string;
  bookingId: number;
}): string {
  return `Thank You for Choosing Safawala

Dear ${params.customerName},

Thank you for trusting Safawala for your special occasion. We hope you had a wonderful experience with us.

We'd love to hear your feedback:

Share Your Experience:
${feedbackLink(params.bookingId)}

Your feedback means a lot to us and helps us serve you even better.

Thank you once again for choosing Safawala. We look forward to serving you again.`;
}
