import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { withServiceRole } from '@/lib/db/client';
import { BOOKING_TERMS, friendlyDate, friendlyTime } from '@/lib/bookings';

/**
 * Server-side (Node) invoice PDF generator for the WhatsApp Customer
 * Automation. This runs inside the Next.js server process (not a
 * browser), so it is deliberately simpler than
 * components/bookings/booking-pdf-button.tsx: no canvas/Image APIs, no
 * product thumbnails, no password protection — just a clean, correct,
 * single-page invoice that mirrors the same branding and numbers.
 *
 * Never throws to its caller: generateInvoicePdf() returns null on any
 * failure so a PDF hiccup can never break the booking/payment flow that
 * triggered it (the caller falls back to a text-only message).
 */

// Same warm cream / amber-gold palette used across the rest of the CRM
// (dashboard cards, the public tracking page, the admin/staff invoice PDF in
// components/bookings/booking-pdf-button.tsx) so every invoice — however it
// reaches the customer — reads as the same document.
const BRAND_DARK: [number, number, number] = [35, 28, 20]; // near-black warm ink
const MUTED: [number, number, number] = [90, 78, 62];
const GOLD: [number, number, number] = [154, 103, 40]; // #9a6728
const GOLD_DEEP: [number, number, number] = [112, 72, 28]; // #70481c
const ESPRESSO: [number, number, number] = [58, 40, 24]; // Balance due bar
const CREAM: [number, number, number] = [255, 253, 249]; // #fffdf9
const CREAM_SOFT: [number, number, number] = [252, 250, 247]; // #fcfaf7
const SAND: [number, number, number] = [245, 234, 216]; // #f5ead8
const BORDER_SOFT: [number, number, number] = [231, 220, 200]; // #e7dcc8
const ROW_TINT: [number, number, number] = SAND;

function sectionDot(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(...GOLD);
  doc.circle(x, y, 0.9, 'F');
}

const amount = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

type InvoiceItem = { item_name: string; quantity: number; unit_price: number; line_total: number };

type InvoiceData = {
  bookingNumber: string;
  bookingType: string;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  eventLocation: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  securityDeposit: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  bank: {
    bank: string;
    accountHolder: string;
    accountNumber: string;
    ifsc: string;
    branch: string | null;
    upi: string | null;
  } | null;
};

async function fetchInvoiceData(bookingId: number): Promise<InvoiceData | null> {
  const [booking] = await withServiceRole((tx) =>
    tx.unsafe(
      `
      select b.booking_number, b.booking_type, b.event_name, b.event_date, b.event_time, b.event_location,
             b.subtotal, b.discount, b.tax, b.security_deposit, b.total, b.paid_amount, b.balance_amount,
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.owner_id
      from public.bookings b
      join public.customers c on c.id = b.customer_id
      where b.id = $1
      `,
      [bookingId],
    ),
  );
  if (!booking) return null;
  const b = booking as unknown as {
    booking_number: string;
    booking_type: string;
    event_name: string;
    event_date: string;
    event_time: string | null;
    event_location: string | null;
    subtotal: number;
    discount: number;
    tax: number;
    security_deposit: number;
    total: number;
    paid_amount: number;
    balance_amount: number;
    customer_name: string;
    customer_phone: string;
    customer_address: string | null;
    owner_id: string;
  };

  const items = (await withServiceRole((tx) =>
    tx.unsafe(
      `select item_name, quantity, unit_price, line_total from public.booking_items where booking_id = $1 order by id`,
      [bookingId],
    ),
  )) as unknown as InvoiceItem[];

  const [bankRow] = await withServiceRole((tx) =>
    tx.unsafe(
      `
      select bank_name, account_holder_name, account_number, ifsc_code, branch_name, upi_id
      from public.bank_accounts
      where owner_id = $1
      order by is_primary desc, created_at asc
      limit 1
      `,
      [b.owner_id],
    ),
  );
  const bank = bankRow
    ? (() => {
        const row = bankRow as unknown as {
          bank_name: string;
          account_holder_name: string;
          account_number: string;
          ifsc_code: string;
          branch_name: string | null;
          upi_id: string | null;
        };
        return {
          bank: row.bank_name,
          accountHolder: row.account_holder_name,
          accountNumber: row.account_number,
          ifsc: row.ifsc_code,
          branch: row.branch_name,
          upi: row.upi_id,
        };
      })()
    : null;

  return {
    bookingNumber: b.booking_number,
    bookingType: b.booking_type,
    eventName: b.event_name,
    eventDate: b.event_date,
    eventTime: b.event_time,
    eventLocation: b.event_location,
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    customerAddress: b.customer_address,
    items: items ?? [],
    subtotal: Number(b.subtotal),
    discount: Number(b.discount),
    tax: Number(b.tax),
    securityDeposit: Number(b.security_deposit),
    total: Number(b.total),
    paidAmount: Number(b.paid_amount),
    balanceAmount: Number(b.balance_amount),
    bank,
  };
}

/** Builds the invoice PDF for a booking. Returns null if it could not be built. */
export async function generateInvoicePdf(
  bookingId: number,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  try {
    const data = await fetchInvoiceData(bookingId);
    if (!data) return null;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const left = 16;
    const right = width - 16;
    let y = 18;

    // A faint cream page wash instead of stark white, matching the rest of
    // the product's warm theme.
    doc.setFillColor(...CREAM_SOFT);
    doc.rect(0, 0, width, doc.internal.pageSize.getHeight(), 'F');

    // ---- Header ----
    doc.setFillColor(...CREAM);
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.55);
    doc.roundedRect(10, 10, width - 20, 32, 3.5, 3.5, 'FD');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.7);
    doc.line(16, 41.6, width - 16, 41.6);

    doc.setTextColor(...GOLD_DEEP);
    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    doc.text('SAFAWALA', left, 24);
    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.text('P R E M I U M   W E D D I N G   A C C E S S O R I E S', left, 37);

    doc.setTextColor(...BRAND_DARK);
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text(data.bookingNumber, right, 20, { align: 'right' });
    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${data.bookingType.toUpperCase()} INVOICE`, right, 27, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Date: ${friendlyDate(new Date().toISOString().slice(0, 10))}`, right, 33, { align: 'right' });

    // ---- Customer / event ----
    y = 48;
    const addressLines = doc.splitTextToSize(data.customerAddress || 'Address not added', 74);
    const locationLines = doc.splitTextToSize(data.eventLocation || 'Location not added', 74);
    const infoLines = Math.max(addressLines.length, locationLines.length);
    const boxH = 26 + (infoLines - 1) * 3.9;
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.45);
    doc.setFillColor(...CREAM);
    doc.roundedRect(left, y, right - left, boxH, 3, 3, 'FD');
    const columnGap = 6;
    const columnWidth = (right - left - columnGap) / 2;
    const eventX = left + columnWidth + columnGap;
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.3);
    doc.line(left + columnWidth + columnGap / 2, y + 6, left + columnWidth + columnGap / 2, y + boxH - 6);

    let by = y + 8.5;
    sectionDot(doc, left + 6, by - 1.5);
    sectionDot(doc, eventX + 3, by - 1.5);
    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('CUSTOMER', left + 9, by);
    doc.text('EVENT', eventX + 6, by);
    by += 6;
    doc.setFontSize(10.5);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont('times', 'bold');
    doc.text(data.customerName, left + 5, by);
    doc.text(data.eventName, eventX + 2, by);
    by += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(data.customerPhone, left + 5, by);
    doc.text(
      `${friendlyDate(data.eventDate)}${data.eventTime ? `, ${friendlyTime(data.eventTime)}` : ''}`,
      eventX + 2,
      by,
    );
    by += 4.8;
    doc.text(addressLines, left + 5, by);
    doc.text(locationLines, eventX + 2, by);
    y += boxH + 7;

    // ---- Items ----
    doc.setFillColor(...ROW_TINT);
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.35);
    doc.rect(left, y, right - left, 7.5, 'FD');
    doc.setTextColor(...GOLD_DEEP);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Item', left + 3, y + 5.1);
    doc.text('Qty', 140, y + 5.1, { align: 'right' });
    doc.text('Rate', 165, y + 5.1, { align: 'right' });
    doc.text('Amount', right - 3, y + 5.1, { align: 'right' });
    y += 7.5;
    doc.setFont('helvetica', 'normal');
    for (const item of data.items) {
      const itemName = doc.splitTextToSize(item.item_name, 100);
      const rowHeight = Math.max(8, itemName.length * 3.9 + 4);
      const textBaseline = y + rowHeight / 2 + 1.2;
      doc.setTextColor(...BRAND_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(itemName, left + 3, textBaseline);
      doc.setFont('helvetica', 'normal');
      doc.text(String(item.quantity), 140, textBaseline, { align: 'right' });
      doc.text(amount(item.unit_price), 165, textBaseline, { align: 'right' });
      doc.text(amount(item.line_total), right - 3, textBaseline, { align: 'right' });
      y += rowHeight;
      doc.setDrawColor(...BORDER_SOFT);
      doc.setLineWidth(0.25);
      doc.line(left, y, right, y);
    }

    // ---- Summary ----
    y += 6;
    const plainSummary: [string, number][] = [
      ['Subtotal', data.subtotal],
      ['Discount', -data.discount],
      ['Tax / charges', data.tax],
      ...(data.bookingType === 'rental'
        ? ([['Security deposit', data.securityDeposit]] as [string, number][])
        : []),
    ];
    for (const [label, value] of plainSummary) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(label, 124, y);
      doc.setTextColor(...BRAND_DARK);
      doc.text(amount(value), right, y, { align: 'right' });
      y += 5.4;
    }

    // Total — soft gold fill bar.
    y += 1;
    doc.setFillColor(...SAND);
    doc.rect(left, y - 4.2, right - left, 7.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...GOLD_DEEP);
    doc.text('Total', 124, y);
    doc.setTextColor(...BRAND_DARK);
    doc.text(amount(data.total), right, y, { align: 'right' });
    y += 6.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Paid', 124, y);
    doc.setTextColor(...BRAND_DARK);
    doc.text(amount(data.paidAmount), right, y, { align: 'right' });
    y += 6.5;

    // Balance due — dark espresso bar with cream text, the one accent
    // that makes the number that matters unmissable.
    doc.setFillColor(...ESPRESSO);
    doc.rect(left, y - 4.6, right - left, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...SAND);
    doc.text('Balance due', 124, y);
    doc.text(amount(data.balanceAmount), right, y, { align: 'right' });
    y += 8.5;

    // ---- Payment details ----
    y += 2;
    if (data.bank) {
      const payBoxH = 34;
      doc.setDrawColor(...BORDER_SOFT);
      doc.setLineWidth(0.45);
      doc.setFillColor(...CREAM);
      doc.roundedRect(left, y, right - left, payBoxH, 3, 3, 'FD');
      let py = y + 8;
      sectionDot(doc, left + 6, py - 1.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text('PAYMENT DETAILS', left + 9, py);
      py += 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const paymentRows: [string, string][] = [
        ['Bank', data.bank.bank],
        ['A/C Holder', data.bank.accountHolder],
        ['A/C No.', data.bank.accountNumber],
        ['IFSC', data.bank.ifsc],
        ['Branch', data.bank.branch || ''],
        ['UPI', data.bank.upi || ''],
      ].filter((row): row is [string, string] => Boolean(row[1]));
      for (const [label, value] of paymentRows) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_DARK);
        doc.text(`${label}`, left + 5, py);
        doc.setTextColor(...BORDER_SOFT);
        doc.text(':', left + 27, py);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MUTED);
        doc.text(value, left + 31, py);
        py += 4.2;
      }
      if (data.bank.upi && data.balanceAmount > 0) {
        try {
          const qrDataUrl = await QRCode.toDataURL(
            `upi://pay?pa=${data.bank.upi}&pn=${encodeURIComponent(data.bank.accountHolder || 'Safawala')}&am=${Math.max(data.balanceAmount, 0).toFixed(2)}&cu=INR`,
            { margin: 0, scale: 6, color: { dark: '#3a2818', light: '#ffffff' } },
          );
          const qrSize = 22;
          const qrX = right - qrSize - 5;
          const qrY = y + (payBoxH - qrSize - 5) / 2;
          doc.setDrawColor(...BORDER_SOFT);
          doc.setLineWidth(0.35);
          doc.roundedRect(qrX - 1.5, qrY - 1.5, qrSize + 3, qrSize + 3, 1.5, 1.5, 'S');
          doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...GOLD_DEEP);
          doc.text('Scan to Pay', qrX + qrSize / 2, qrY + qrSize + 4.2, { align: 'center' });
        } catch (err) {
          // A QR failure must never break invoice generation.
          console.error('[whatsapp] invoice QR generation failed', err);
        }
      }
      y += payBoxH + 8;
    }

    // ---- Terms & conditions ----
    sectionDot(doc, left + 1.4, y - 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...GOLD_DEEP);
    doc.text('TERMS & CONDITIONS', left + 4, y);
    y += 2.8;
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.35);
    doc.line(left, y, right, y);
    y += 4.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    for (let i = 0; i < BOOKING_TERMS.length; i += 1) {
      const term = BOOKING_TERMS[i].replaceAll('₹', 'Rs.');
      const lines = doc.splitTextToSize(term, right - left - 6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GOLD);
      doc.text(`${i + 1}.`, left, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(lines, left + 6.5, y);
      y += lines.length * 3.2 + 0.8;
    }

    // ---- Footer ----
    doc.setDrawColor(...BORDER_SOFT);
    doc.setLineWidth(0.35);
    doc.line(left, 285, right, 285);
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...GOLD_DEEP);
    doc.text('Thank you', left, 291);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('F O R   C H O O S I N G   S A F A W A L A', left, 294.6);
    doc.setFontSize(7);
    doc.text('Page 1 of 1', right, 290, { align: 'right' });

    const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
    return { buffer: Buffer.from(arrayBuffer), fileName: `${data.bookingNumber}.pdf` };
  } catch (err) {
    console.error('[whatsapp] failed to generate invoice PDF', err);
    return null;
  }
}
