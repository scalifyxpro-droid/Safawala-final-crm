'use client';

import { useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import type { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { BRAND_DARK, MUTED, ROW_ALT, fitText, loadBrandLogo, randomOwnerPassword } from '@/lib/pdf/brand';

export type PackingSlipDetails = {
  jobId: string;
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  venue: string | null;
};

export type PackingSlipItem = { itemName: string; quantity: number; barcode: string | null };
type Logo = Awaited<ReturnType<typeof loadBrandLogo>>;

function drawCopy(doc: jsPDF, top: number, details: PackingSlipDetails, items: PackingSlipItem[], logo: Logo) {
  const left = 11;
  const right = 199;
  const width = right - left;
  doc.setDrawColor(130, 116, 98);
  doc.setLineWidth(0.35);
  doc.roundedRect(left, top, width, 136, 3, 3, 'S');

  if (logo) {
    const logoWidth = Math.min(16 * logo.ratio, 68);
    doc.addImage(logo.dataUrl, 'PNG', left + 6, top + 5, logoWidth, logoWidth / logo.ratio);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_DARK);
    doc.text('SAFAWALA', left + 6, top + 16);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Premium Wedding Accessories', left + 6, top + 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_DARK);
  doc.text(details.bookingNumber, right - 6, top + 11, { align: 'right' });
  doc.setFontSize(7.5);
  doc.text('QC & PACKING SLIP', right - 6, top + 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Job: ${details.jobId}`, right - 6, top + 24, { align: 'right' });
  doc.setDrawColor(220, 210, 196);
  doc.line(left + 5, top + 31, right - 5, top + 31);

  const boxX = left + 5;
  const boxW = width - 10;
  const infoY = top + 35;
  doc.setDrawColor(190, 178, 163);
  doc.roundedRect(boxX, infoY, boxW, 28, 2.5, 2.5, 'S');
  const dividerX = boxX + boxW / 2;
  doc.line(dividerX, infoY + 4, dividerX, infoY + 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CUSTOMER', boxX + 5, infoY + 6);
  doc.text('EVENT & VENUE', dividerX + 5, infoY + 6);
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_DARK);
  doc.text(fitText(doc, details.customerName, boxW / 2 - 10), boxX + 5, infoY + 12);
  doc.text(fitText(doc, details.eventName, boxW / 2 - 10), dividerX + 5, infoY + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(fitText(doc, details.customerPhone || 'Phone not added', boxW / 2 - 10), boxX + 5, infoY + 18);
  doc.text(fitText(doc, `${friendlyDate(details.eventDate)}${details.eventTime ? `, ${friendlyTime(details.eventTime)}` : ''}`, boxW / 2 - 10), dividerX + 5, infoY + 18);
  doc.text(fitText(doc, details.venue || 'Venue not added', boxW / 2 - 10), dividerX + 5, infoY + 24);

  const tableY = top + 68;
  const tableBottom = top + 130;
  const columns = items.length > 9 ? 2 : 1;
  const rowsPerColumn = Math.ceil(items.length / columns);
  const rowHeight = Math.min(6.1, (tableBottom - tableY - 9) / rowsPerColumn);
  const gap = columns === 2 ? 4 : 0;
  const tableWidth = (boxW - gap) / columns;
  for (let column = 0; column < columns; column += 1) {
    const x = boxX + column * (tableWidth + gap);
    const count = Math.min(rowsPerColumn, items.length - column * rowsPerColumn);
    const height = 8 + count * rowHeight;
    doc.setDrawColor(180, 168, 153);
    doc.roundedRect(x, tableY, tableWidth, height, 2.5, 2.5, 'S');
    doc.setFillColor(245, 241, 235);
    doc.roundedRect(x + 0.2, tableY + 0.2, tableWidth - 0.4, 7.8, 2.3, 2.3, 'F');
    doc.rect(x + 0.2, tableY + 4, tableWidth - 0.4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(columns === 2 ? 6.3 : 7);
    doc.setTextColor(...BRAND_DARK);
    doc.text('PACKED ITEM', x + 3, tableY + 5.2);
    doc.text('BARCODE', x + (columns === 2 ? 54 : 113), tableY + 5.2);
    doc.text('QTY', x + tableWidth - 3, tableY + 5.2, { align: 'right' });
    for (let index = 0; index < count; index += 1) {
      const item = items[column * rowsPerColumn + index];
      const rowY = tableY + 8 + index * rowHeight;
      if (index % 2 === 0) {
        doc.setFillColor(...ROW_ALT);
        doc.rect(x + 0.25, rowY, tableWidth - 0.5, rowHeight, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(columns === 2 ? 6.4 : 7.5);
      doc.setTextColor(...BRAND_DARK);
      doc.text(fitText(doc, item.itemName, columns === 2 ? 49 : 106), x + 3, rowY + rowHeight / 2 + 1.2);
      doc.setTextColor(...MUTED);
      doc.text(fitText(doc, item.barcode || '-', columns === 2 ? 19 : 42), x + (columns === 2 ? 54 : 113), rowY + rowHeight / 2 + 1.2);
      doc.setTextColor(...BRAND_DARK);
      doc.text(String(item.quantity), x + tableWidth - 3, rowY + rowHeight / 2 + 1.2, { align: 'right' });
      if (index < count - 1) {
        doc.setDrawColor(230, 224, 217);
        doc.line(x + 2, rowY + rowHeight, x + tableWidth - 2, rowY + rowHeight);
      }
    }
    // Re-stroke last so row fills retain the rounded outer corners.
    doc.setDrawColor(180, 168, 153);
    doc.roundedRect(x, tableY, tableWidth, height, 2.5, 2.5, 'S');
  }
}

export function PackingSlipButton({ details, items }: { details: PackingSlipDetails; items: PackingSlipItem[] }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function createSlip() {
    setCreating(true);
    setError('');
    try {
      if (items.length > 24) throw new Error('This packing slip has too many rows for two readable copies on one A4 page.');
      const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadBrandLogo()]);
      const doc = new jsPDF({
        unit: 'mm', format: 'a4',
        encryption: { userPassword: '', ownerPassword: randomOwnerPassword(), userPermissions: ['print', 'copy'] },
      });
      drawCopy(doc, 7, details, items, logo);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.setDrawColor(190, 178, 163);
      doc.line(11, 148.5, 199, 148.5);
      doc.setLineDashPattern([], 0);
      drawCopy(doc, 154, details, items, logo);
      doc.save(`Packing-Slip-${details.bookingNumber}.pdf`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the packing slip.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-w-0">
      <Button type="button" variant="outline" disabled={creating || items.length === 0} onClick={createSlip}>
        {creating ? <LoaderCircle className="animate-spin" /> : <FileText />}
        {creating ? 'Preparing…' : 'Packing slip'}
      </Button>
      {error ? <p className="mt-1 max-w-56 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
