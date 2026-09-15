'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BOOKING_TERMS, friendlyDate, friendlyTime } from '@/lib/bookings';
import type { PublicBankDetails } from '@/lib/settings/types';

export type PdfBooking = {
  booking_number: string;
  booking_type: string;
  is_quote?: boolean;
  status?: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  pickup_date: string | null;
  due_date: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  security_deposit: number;
  total: number;
  paid_amount: number;
  balance_amount: number;
  customers: { name: string; phone: string; address?: string | null } | null;
  booking_items: {
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    product_id?: number | null;
    products?: { image_urls: string[] | null; barcode: string | null } | null;
  }[];
};

// Safawala's own bank details, printed on every generated invoice/quote.
const FALLBACK_BANK_DETAILS: PublicBankDetails = {
  bank: 'ICICI Bank',
  accountHolder: 'Mr. Ronak Dave',
  accountNumber: '187501504458',
  ifsc: 'ICIC0001396',
  branch: 'Vadodara',
  upi: '7020926385@okbizaxis',
  qrCodeImage: null,
};

async function loadPaymentDetails(): Promise<PublicBankDetails> {
  try {
    const response = await fetch('/api/settings/payment-details', { cache: 'no-store' });
    if (!response.ok) return FALLBACK_BANK_DETAILS;
    const payload = await response.json() as { data?: PublicBankDetails | null };
    return payload.data ?? FALLBACK_BANK_DETAILS;
  } catch {
    // PDF generation must remain available during a temporary settings lookup
    // failure. The last known business account remains the safe fallback.
    return FALLBACK_BANK_DETAILS;
  }
}

const BRAND_DARK: [number, number, number] = [24, 24, 24];
const BRAND_MID: [number, number, number] = [52, 52, 52];
const BRAND_GOLD: [number, number, number] = [24, 24, 24];
const BORDER_SOFT: [number, number, number] = [92, 92, 92];
const MUTED: [number, number, number] = [78, 78, 78];

const amount = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function drawBrandBanner(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.45);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');
}
function sectionBox(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.setDrawColor(...BORDER_SOFT);
  doc.setLineWidth(0.4);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
}

function fitText(
  doc: import('jspdf').jsPDF,
  value: string,
  maxWidth: number,
) {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let fitted = value;
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}...`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

// Recolors a black-on-transparent logo PNG to a solid brand color, so the
// same sidebar logo can be reused, tinted for a dark or light background.
async function recolorLogo(
  src: string,
  color: [number, number, number],
): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      ratio: canvas.width / canvas.height,
    };
  } catch {
    return null;
  }
}

async function toDataUrl(src: string): Promise<string | null> {
  if (src.startsWith('data:image/')) return src;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Crops a fetched product photo into a small rounded-corner square so it
// sits neatly inline with each invoice line item.
async function roundedThumbnail(
  dataUrl: string,
  size = 120,
  radius = 22,
): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.arcTo(size, 0, size, size, radius);
    ctx.arcTo(size, size, 0, size, radius);
    ctx.arcTo(0, size, 0, 0, radius);
    ctx.arcTo(0, 0, size, 0, radius);
    ctx.closePath();
    ctx.clip();
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function BookingPdfButton({ booking, label = 'PDF' }: { booking: PdfBooking; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const [{ jsPDF }, QRCode] = await Promise.all([
        import('jspdf'),
        import('qrcode'),
      ]);
      const bankDetails = await loadPaymentDetails();
      const isQuote = Boolean(booking.is_quote && booking.status === 'draft');
      const docLabel = isQuote
        ? 'QUOTATION'
        : `${booking.booking_type.toUpperCase()} INVOICE`;

      // Preload the logo (recolored for a dark banner) and every product
      // thumbnail referenced by this booking's items, in parallel.
      const uniqueImageUrls = Array.from(
        new Set(
          booking.booking_items
            .map((item) => item.products?.image_urls?.[0])
            .filter((url): url is string => Boolean(url)),
        ),
      );
      const [logo, signature, qrDataUrl, ...rawProductImages] = await Promise.all([
        recolorLogo('/safawala-crown-dark.png', BRAND_DARK),
        recolorLogo('/ronak-dave-signature.png', BRAND_DARK),
        bankDetails.qrCodeImage
          ? toDataUrl(bankDetails.qrCodeImage)
          : bankDetails.upi
            ? QRCode.toDataURL(
                `upi://pay?pa=${bankDetails.upi}&pn=${encodeURIComponent(bankDetails.accountHolder || 'Safawala')}&am=${Math.max(booking.balance_amount, 0).toFixed(2)}&cu=INR`,
                { margin: 0, scale: 6 },
              ).catch(() => null)
            : Promise.resolve(null),
        ...uniqueImageUrls.map((url) => toDataUrl(url)),
      ]);
      const roundedProductImages = await Promise.all(
        rawProductImages.map((dataUrl) =>
          dataUrl ? roundedThumbnail(dataUrl) : Promise.resolve(null),
        ),
      );
      const imageByUrl = new Map(
        uniqueImageUrls.map((url, index) => [url, roundedProductImages[index]]),
      );

      const ownerPassword =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().replaceAll('-', '')
          : `safawala-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        encryption: {
          userPassword: '',
          ownerPassword,
          userPermissions: ['print', 'copy'],
        },
      });
      const width = doc.internal.pageSize.getWidth();
      const left = 16;
      const right = width - 16;
      const itemCount = booking.booking_items.length;
      const useItemColumns = itemCount > 5;
      const denseLayout = itemCount > 10;
      const headerHeight = denseLayout ? 30 : 34;
      let y = 18;
      // The invoice is intentionally composed as a single A4 page. Sections
      // below use compact, content-aware spacing instead of page breaks.
      const ensureSpace = (_height: number) => undefined;

      // ---- Header banner ----
      drawBrandBanner(doc, 10, 10, width - 20, headerHeight);
      if (logo) {
        const logoH = denseLayout ? 11 : 13;
        const logoW = logoH * logo.ratio;
        doc.addImage(logo.dataUrl, 'PNG', left, denseLayout ? 14 : 15, logoW, logoH);
      } else {
        doc.setTextColor(...BRAND_DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('SAFAWALA', left, 24);
      }
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Premium Wedding Accessories', left, 10 + headerHeight - 4);

      doc.setTextColor(...BRAND_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(booking.booking_number, right, denseLayout ? 19 : 21, { align: 'right' });
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(docLabel, right, denseLayout ? 25 : 28, { align: 'right' });
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(
        `Date: ${friendlyDate(new Date().toISOString().slice(0, 10))}`,
        right,
        denseLayout ? 31 : 34,
        { align: 'right' },
      );

      // ---- Customer / event (boxed, aligned to the same margins) ----
      y = 10 + headerHeight + 5;
      const addressLines = doc.splitTextToSize(
        booking.customers?.address || 'Address not added',
        74,
      );
      const locationLines = doc.splitTextToSize(
        booking.event_location || 'Location not added',
        74,
      );
      const infoLines = Math.max(addressLines.length, locationLines.length);
      const isRental = booking.booking_type === 'rental';
      const boxH = 25 + (infoLines - 1) * 3.9 + (isRental ? 8 : 0);
      sectionBox(doc, left, y, right - left, boxH);
      const columnGap = 6;
      const columnWidth = (right - left - columnGap) / 2;
      const eventX = left + columnWidth + columnGap;
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(0.25);
      doc.line(left + columnWidth + columnGap / 2, y + 5, left + columnWidth + columnGap / 2, y + boxH - 5);

      let by = y + 8;
      doc.setTextColor(...BRAND_MID);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('CUSTOMER', left + 5, by);
      doc.text('EVENT & DELIVERY', eventX + 2, by);
      by += 5.5;
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND_DARK);
      doc.setFont('helvetica', 'bold');
      doc.text(booking.customers?.name || 'Not added', left + 5, by);
      doc.text(booking.event_name, eventX + 2, by);
      by += 4.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(booking.customers?.phone || 'Phone not added', left + 5, by);
      doc.text(
        `${friendlyDate(booking.event_date)}${booking.event_time ? `, ${friendlyTime(booking.event_time)}` : ''}`,
        eventX + 2,
        by,
      );
      by += 4.6;
      doc.setTextColor(...MUTED);
      doc.text(addressLines, left + 5, by);
      doc.text(locationLines, eventX + 2, by);
      by += infoLines * 3.9 + 1;

      if (isRental) {
        doc.setTextColor(...BRAND_DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Pickup:', left + 5, by);
        doc.setFont('helvetica', 'normal');
        doc.text(friendlyDate(booking.pickup_date), left + 20, by);
        doc.setFont('helvetica', 'bold');
        doc.text('Return due:', eventX + 2, by);
        doc.setFont('helvetica', 'normal');
        doc.text(
          friendlyDate(booking.due_date),
          eventX + 24,
          by,
        );
      }
      y += boxH + 6;

      // ---- Items (inventory barcode included) ----
      if (useItemColumns) {
        const gridGap = 5;
        const gridWidth = (right - left - gridGap) / 2;
        const rowsPerColumn = Math.ceil(itemCount / 2);
        const rowHeight = Math.max(7.2, Math.min(11.2, 56 / rowsPerColumn));
        const gridHeaderHeight = denseLayout ? 6 : 7;
        const columns = [
          booking.booking_items.slice(0, rowsPerColumn),
          booking.booking_items.slice(rowsPerColumn),
        ];

        columns.forEach((items, columnIndex) => {
          const columnX = left + columnIndex * (gridWidth + gridGap);
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(...BORDER_SOFT);
          doc.setLineWidth(0.3);
          doc.rect(columnX, y, gridWidth, gridHeaderHeight, 'FD');
          doc.setTextColor(...BRAND_DARK);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(denseLayout ? 7.2 : 8);
          doc.text(
            `PRODUCTS ${columnIndex * rowsPerColumn + 1}-${columnIndex * rowsPerColumn + items.length}`,
            columnX + 2.5,
            y + gridHeaderHeight - 2.1,
          );
          doc.text('AMOUNT', columnX + gridWidth - 2.5, y + gridHeaderHeight - 2.1, {
            align: 'right',
          });

          items.forEach((item, rowIndex) => {
            const rowTop = y + gridHeaderHeight + rowIndex * rowHeight;
            const thumbUrl = item.products?.image_urls?.[0];
            const thumb = thumbUrl ? imageByUrl.get(thumbUrl) : null;
            const showThumb = Boolean(thumb && rowHeight >= 9);
            const thumbSize = Math.min(8, rowHeight - 1.6);
            const textX = columnX + (showThumb ? thumbSize + 3.5 : 2.5);
            const totalText = amount(item.line_total);
            const totalWidth = doc.getTextWidth(totalText) + 3;

            if (showThumb && thumb) {
              try {
                doc.addImage(
                  thumb,
                  'PNG',
                  columnX + 1.5,
                  rowTop + (rowHeight - thumbSize) / 2,
                  thumbSize,
                  thumbSize,
                  undefined,
                  'FAST',
                );
              } catch {
                // Skip a thumbnail that fails to decode rather than break the PDF.
              }
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(rowHeight < 8 ? 6.3 : 7.3);
            doc.setTextColor(...BRAND_DARK);
            doc.text(
              fitText(doc, item.item_name, gridWidth - (textX - columnX) - totalWidth - 2),
              textX,
              rowTop + rowHeight * 0.42,
            );
            doc.text(totalText, columnX + gridWidth - 2.5, rowTop + rowHeight * 0.42, {
              align: 'right',
            });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(rowHeight < 8 ? 5.8 : 6.5);
            doc.setTextColor(...MUTED);
            doc.text(
              `Barcode: ${item.products?.barcode || '-'}`,
              textX,
              rowTop + rowHeight * 0.78,
            );
            doc.text(
              `${item.quantity} x ${amount(item.unit_price)}`,
              columnX + gridWidth - 2.5,
              rowTop + rowHeight * 0.78,
              { align: 'right' },
            );
            doc.setDrawColor(205, 205, 205);
            doc.setLineWidth(0.18);
            doc.line(columnX, rowTop + rowHeight, columnX + gridWidth, rowTop + rowHeight);
          });
        });
        y += gridHeaderHeight + rowsPerColumn * rowHeight;
      } else {
        const nameX = left + 16;
        doc.setFillColor(245, 245, 245);
        doc.rect(left, y, right - left, 7, 'F');
        doc.setDrawColor(...BORDER_SOFT);
        doc.setLineWidth(0.3);
        doc.rect(left, y, right - left, 7, 'S');
        doc.setTextColor(...BRAND_DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Item', nameX, y + 4.8);
        doc.text('Barcode', 112, y + 4.8, { align: 'right' });
        doc.text('Qty', 132, y + 4.8, { align: 'right' });
        doc.text('Rate', 160, y + 4.8, { align: 'right' });
        doc.text('Amount', right - 3, y + 4.8, { align: 'right' });
        y += 7;
        doc.setFont('helvetica', 'normal');
        for (const item of booking.booking_items) {
          const thumbUrl = item.products?.image_urls?.[0];
          const thumb = thumbUrl ? imageByUrl.get(thumbUrl) : null;
          const itemName = doc.splitTextToSize(item.item_name, 48);
          const textHeight = itemName.length * 3.9;
          const rowHeight = Math.max(thumb ? 14 : 8.5, textHeight + 5);
          ensureSpace(rowHeight + 2);
          const rowTop = y;
          const textBaseline = rowTop + rowHeight / 2 + 1.2;
          if (thumb) {
            try {
              const thumbSize = 10.5;
              doc.addImage(
                thumb,
                'PNG',
                left + 2,
                rowTop + (rowHeight - thumbSize) / 2,
                thumbSize,
                thumbSize,
                undefined,
                'FAST',
              );
            } catch {
              // Skip a thumbnail that fails to decode rather than break the PDF.
            }
          }
          doc.setTextColor(...BRAND_DARK);
          doc.setFontSize(8.5);
          doc.text(itemName, nameX, textBaseline);
          doc.setFontSize(7.4);
          doc.text(item.products?.barcode || '-', 112, textBaseline, { align: 'right' });
          doc.setFontSize(8.5);
          doc.text(String(item.quantity), 132, textBaseline, { align: 'right' });
          doc.text(amount(item.unit_price), 160, textBaseline, { align: 'right' });
          doc.text(amount(item.line_total), right - 3, textBaseline, {
            align: 'right',
          });
          y = rowTop + rowHeight;
          doc.setDrawColor(...BORDER_SOFT);
          doc.setLineWidth(0.2);
          doc.line(left, y, right, y);
        }
      }

      ensureSpace(38);
      y += 4;
      const summary = [
        ['Subtotal', booking.subtotal],
        ['Discount', -booking.discount],
        ['Tax / charges', booking.tax],
        ...(booking.booking_type === 'rental'
          ? [['Security deposit', booking.security_deposit] as [string, number]]
          : []),
        ['Total', booking.total],
        ['Paid', booking.paid_amount],
        ['Balance due', booking.balance_amount],
      ] as [string, number][];
      for (const [label, value] of summary) {
        const strong = label === 'Total' || label === 'Balance due';
        doc.setFont('helvetica', strong ? 'bold' : 'normal');
        doc.setTextColor(...(strong ? BRAND_DARK : MUTED));
        doc.text(label, 124, y);
        doc.setTextColor(...BRAND_DARK);
        doc.text(amount(value), right, y, { align: 'right' });
        y += 5.1;
      }

      // ---- Payment details (boxed, with UPI QR) ----
      ensureSpace(37);
      y += 2;
      const payBoxH = 37;
      sectionBox(doc, left, y, right - left, payBoxH);
      let py = y + 7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND_MID);
      doc.text('PAYMENT DETAILS', left + 5, py);
      py += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const paymentRows: [string, string][] = [
        ['Bank', bankDetails.bank],
        ['A/C Holder', bankDetails.accountHolder],
        ['A/C No.', bankDetails.accountNumber],
        ['IFSC', bankDetails.ifsc],
        ['Branch', bankDetails.branch],
        ['UPI', bankDetails.upi],
      ].filter((row): row is [string, string] => Boolean(row[1]));
      for (const [label, value] of paymentRows) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_DARK);
        doc.text(`${label}:`, left + 5, py);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MUTED);
        doc.text(value, left + 33, py);
        py += 4;
      }
      if (qrDataUrl) {
        const qrSize = 22;
        const qrX = right - qrSize - 5;
        const qrY = y + (payBoxH - qrSize - 5) / 2;
        const qrFormat = qrDataUrl.startsWith('data:image/jpeg')
          ? 'JPEG'
          : qrDataUrl.startsWith('data:image/webp')
            ? 'WEBP'
            : 'PNG';
        doc.addImage(qrDataUrl, qrFormat, qrX, qrY, qrSize, qrSize);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BRAND_MID);
        doc.text('Scan to Pay', qrX + qrSize / 2, qrY + qrSize + 3.6, {
          align: 'center',
        });
      }
      if (signature) {
        const signatureW = 32;
        const signatureH = signatureW / signature.ratio;
        const signatureX = right - 70;
        const signatureY = y + 7;
        doc.addImage(
          signature.dataUrl,
          'PNG',
          signatureX,
          signatureY,
          signatureW,
          signatureH,
          undefined,
          'FAST',
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BRAND_MID);
        doc.text(
          'Authorized Signatory',
          signatureX + signatureW / 2,
          y + payBoxH - 4,
          { align: 'center' },
        );
      }
      y += payBoxH + 9;

      // ---- Terms (clean numbered list with a hanging indent) ----
      ensureSpace(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND_DARK);
      doc.text('TERMS & CONDITIONS', left, y);
      y += 2.5;
      doc.setDrawColor(...BORDER_SOFT);
      doc.setLineWidth(0.3);
      doc.line(left, y, right, y);
      y += 4.5;
      const termIndent = 6.5;
      const termColumnGap = 7;
      const termColumnCount = useItemColumns ? 2 : 1;
      const termsPerColumn = Math.ceil(BOOKING_TERMS.length / termColumnCount);
      const termColumnWidth =
        (right - left - termColumnGap * (termColumnCount - 1)) / termColumnCount;
      const availableTermsHeight = Math.max(1, 280 - y);
      let termFontSize = useItemColumns ? 6.7 : 7.2;
      let termLineHeight = useItemColumns ? 3.05 : 3.35;
      const measuredTerms = () =>
        BOOKING_TERMS.map((term) =>
          doc.splitTextToSize(
            term.replaceAll('₹', 'Rs.'),
            termColumnWidth - termIndent,
          ),
        );
      const tallestTermColumn = (lines: string[][]) => {
        let tallest = 0;
        for (let column = 0; column < termColumnCount; column += 1) {
          const columnLines = lines.slice(
            column * termsPerColumn,
            (column + 1) * termsPerColumn,
          );
          tallest = Math.max(
            tallest,
            columnLines.reduce(
              (sum, itemLines) => sum + itemLines.length * termLineHeight + 0.6,
              0,
            ),
          );
        }
        return tallest;
      };
      doc.setFontSize(termFontSize);
      let termLines = measuredTerms();
      while (
        tallestTermColumn(termLines) > availableTermsHeight &&
        termFontSize > 5.8
      ) {
        termFontSize -= 0.2;
        termLineHeight -= 0.08;
        doc.setFontSize(termFontSize);
        termLines = measuredTerms();
      }
      const termStartY = y;
      let termEndY = termStartY;
      for (let column = 0; column < termColumnCount; column += 1) {
        const termX = left + column * (termColumnWidth + termColumnGap);
        let termY = termStartY;
        const start = column * termsPerColumn;
        const end = Math.min(start + termsPerColumn, BOOKING_TERMS.length);
        for (let index = start; index < end; index += 1) {
          const safeTerm = BOOKING_TERMS[index].replaceAll('₹', 'Rs.');
          const lines =
            termLines[index] ??
            doc.splitTextToSize(safeTerm, termColumnWidth - termIndent);
          const blockHeight = lines.length * termLineHeight + 0.6;
          ensureSpace(blockHeight);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...BRAND_GOLD);
          doc.text(`${index + 1}.`, termX, termY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...BRAND_DARK);
          doc.text(lines, termX + termIndent, termY);
          termY += blockHeight;
        }
        termEndY = Math.max(termEndY, termY);
      }
      y = termEndY;

      doc.setDrawColor(...BORDER_SOFT);
      doc.setLineWidth(0.3);
      doc.line(left, 285, right, 285);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text('Thank you for choosing Safawala.', left, 290);
      doc.text('Page 1 of 1', right, 290, { align: 'right' });
      doc.save(`${booking.booking_number}.pdf`);
    } catch (error) {
      console.error('Could not generate booking PDF', error);
      window.alert('Could not generate the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={downloadPdf}
      disabled={busy}
      title={label === 'PDF' ? 'Download protected PDF' : label}
      aria-label={`${label} for ${booking.booking_number}`}
    >
      <Download />
      <span className={label === 'PDF' ? 'hidden 2xl:inline' : undefined}>{label}</span>
    </Button>
  );
}
