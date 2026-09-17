export type BookingType = 'sale' | 'rental';

export const BOOKING_TERMS = [
  'Sold products will not be returned or exchanged.',
  'Please book the Safa Wale service at least 1 month in advance.',
  'We will not allow any last-minute changes in placed orders.',
  'Your responsibility shall remain to tie the turban at the venue before the wedding date.',
  'Total outstanding with Security Deposit needs to be paid before the wedding date.',
  'If safa is lost / torn / burnt, it is mandatory to pay ₹400 / ₹600 / ₹800 per safa by the party.',
  'Our staff team will not ask guests to return safas (as per company reputation & policies).',
  'All safas will be collected by the next day. Otherwise, extra rent will be charged and claimed from the given Security Deposit amount.',
  'Safawala’s service will be provided for a maximum of 5 hours only.',
  'Overtime is charged at ₹1500 per hour, and the party is responsible for ensuring guests wear the safa on time.',
  'Local-city service is limited to 1 hour. Outstation service is limited to 4 hours and is available only until 9:30 pm.',
  'Any late or overtime charges will be deducted from the Security Deposit.',
  'I hereby declare that all the above products are selected and checked by me.',
  'Subject to Vadodara jurisdiction.',
] as const;

export type BookingRow = {
  id: number;
  booking_number: string;
  booking_type: BookingType;
  status: string;
  payment_status: string;
  is_quote?: boolean;
  converted_booking_id?: number | null;
  created_by_staff_id?: number | null;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  pickup_date: string | null;
  due_date: string | null;
  total: number;
  paid_amount: number;
  balance_amount: number;
  security_deposit: number;
  created_at: string;
  customers: { name: string; phone: string } | null;
  staff_members: { name: string } | null;
};

export const statusLabel = (value: string) =>
  value
    .split('_')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

export function displayDocumentNumber(value: string) {
  const match = value.match(/^(.*-)(\d+)$/);
  if (!match) return value;
  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(sequence)) return value;
  return `${match[1]}${String(sequence).padStart(4, '0')}`;
}

export function displayQuoteNumber(
  value: string,
  bookingType: BookingType,
  sequenceOverride?: number,
) {
  const normalized = displayDocumentNumber(value);
  const match = normalized.match(/^SW-Q-(?:[SR]-)?(\d{4})-(\d+)$/);
  if (!match) return normalized;
  const sequence = sequenceOverride ?? Number(match[2]);
  if (!Number.isSafeInteger(sequence)) return normalized;
  const quoteType = bookingType === 'rental' ? 'R' : 'S';
  return `SW-Q-${quoteType}-${match[1]}-${String(sequence).padStart(4, '0')}`;
}

function parseBookingDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = value.trim();
  if (!text) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const normalized = dateOnly
    ? `${text}T00:00:00`
    : text
        .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:)/, '$1T$2')
        .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
        .replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const friendlyDate = (value: string | Date | null | undefined) => {
  const date = parseBookingDate(value);
  if (!date) return 'Not added';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

/** Day heading for lists sorted by the booking's database creation date. */
export function bookingDateHeading(value: string) {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return 'Date not available';
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== datePart) return 'Date not available';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export const friendlyDateTime = (value: string | Date) => {
  const date = parseBookingDate(value);
  if (!date) return 'Not added';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

export const friendlyTime = (value: string | null | undefined) => {
  if (!value) return 'Time not added';
  const [hourText = '0', minute = '00'] = value.split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  return `${String(hour % 12 || 12).padStart(2, '0')}:${minute.slice(0, 2)} ${hour >= 12 ? 'PM' : 'AM'}`;
};

export type QuoteState = 'generated' | 'converted' | 'rejected';

export function quoteState(status: string): QuoteState {
  if (status === 'draft') return 'generated';
  if (status === 'cancelled') return 'rejected';
  return 'converted';
}

export const QUOTE_STATE_LABEL: Record<QuoteState, string> = {
  generated: 'Generated',
  converted: 'Converted',
  rejected: 'Rejected',
};

export function quoteStateTone(state: QuoteState) {
  if (state === 'converted')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

export function statusTone(status: string) {
  if (['paid', 'completed', 'active'].includes(status))
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['cancelled', 'refunded'].includes(status))
    return 'border-red-200 bg-red-50 text-red-700';
  if (['partial', 'ready', 'out_for_delivery'].includes(status))
    return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-stone-200 bg-stone-50 text-stone-700';
}
