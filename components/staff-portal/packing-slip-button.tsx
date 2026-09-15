'use client';

import { useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import {
  BRAND_DARK,
  MUTED,
  ROW_ALT,
  randomOwnerPassword,
  drawSignOffLines,
  drawTableHeaderRow,
  loadBrandLogo,
  sectionBox,
  stampFooterOnAllPages,
} from '@/lib/pdf/brand';

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

export type PackingSlipItem = {
  itemName: string;
  quantity: number;
  barcode: string | null;
};

export function PackingSlipButton({ details, items }: { details: PackingSlipDetails; items: PackingSlipItem[] }) {
  const [creating, setCreating] = useState(false);

  async function createSlip() {
    setCreating(true);
    try {
      const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadBrandLogo()]);
      const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        encryption: { userPassword: '', ownerPassword: randomOwnerPassword(), userPermissions: ['print', 'copy'] },
      });
      const width = doc.internal.pageSize.getWidth();
      const left = 16;
      const right = width - 16;
      const boxWidth = right - left;

      // ---- Header banner ----
      const headerTop = 10;
      const headerHeight = 34;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(92, 92, 92);
      doc.setLineWidth(0.45);
      doc.roundedRect(left - 6, headerTop, boxWidth + 12, headerHeight, 3, 3, 'FD');
      if (logo) {
        const logoH = 13;
        doc.addImage(logo.dataUrl, 'PNG', left, headerTop + 5, logoH * logo.ratio, logoH);
      } else {
        doc.setTextColor(...BRAND_DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('SAFAWALA', left, headerTop + 14);
      }
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Premium Wedding Accessories', left, headerTop + headerHeight - 4);
      doc.setTextColor(...BRAND_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(details.bookingNumber, right, headerTop + 11, { align: 'right' });
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text('QC & PACKING SLIP', right, headerTop + 18, { align: 'right' });
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`Job: ${details.jobId}`, right, headerTop + 24, { align: 'right' });

      // ---- Job / event info box ----
      let y = headerTop + headerHeight + 6;
      const boxH = 25;
      sectionBox(doc, left, y, boxWidth, boxH);
      const columnGap = 6;
      const columnWidth = (boxWidth - columnGap) / 2;
      const eventX = left + columnWidth + columnGap;
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(0.25);
      doc.line(left + columnWidth + columnGap / 2, y + 5, left + columnWidth + columnGap / 2, y + boxH - 5);
      let by = y + 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_DARK);
      doc.text('CUSTOMER', left + 5, by);
      doc.text('EVENT & VENUE', eventX + 2, by);
      by += 5.5;
      doc.setFontSize(9.5);
      doc.text(details.customerName, left + 5, by);
      doc.text(details.eventName, eventX + 2, by);
      by += 4.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(details.customerPhone || 'Phone not added', left + 5, by);
      doc.text(
        `${friendlyDate(details.eventDate)}${details.eventTime ? `, ${friendlyTime(details.eventTime)}` : ''}`,
        eventX + 2,
        by,
      );
      by += 4.6;
      doc.text(details.venue || 'Venue not added', eventX + 2, by, { maxWidth: columnWidth - 4 });
      y += boxH + 6;

      // ---- Packed items table ----
      const nameX = left + 3;
      y = drawTableHeaderRow(doc, {
        x: left,
        y,
        w: boxWidth,
        columns: [
          { label: 'PACKED ITEM', x: nameX },
          { label: 'BARCODE', x: left + 110 },
          { label: 'QTY', x: right - 3, align: 'right' },
        ],
      });
      doc.setFontSize(9);
      items.forEach((item, index) => {
        if (y > 262) {
          doc.addPage();
          y = 20;
        }
        const lines = doc.splitTextToSize(item.itemName, 88) as string[];
        const height = Math.max(9, lines.length * 4.5 + 3);
        if (index % 2 === 0) {
          doc.setFillColor(...ROW_ALT);
          doc.rect(left, y - 5, boxWidth, height, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BRAND_DARK);
        doc.text(lines, nameX, y);
        doc.setTextColor(...MUTED);
        doc.text(item.barcode || '-', left + 110, y);
        doc.setTextColor(...BRAND_DARK);
        doc.text(String(item.quantity), right - 3, y, { align: 'right' });
        y += height;
        doc.setDrawColor(205, 205, 205);
        doc.setLineWidth(0.18);
        doc.line(left, y - 5, right, y - 5);
      });

      y = Math.min(Math.max(y + 12, 235), 268);
      drawSignOffLines(doc, { left, right, y, leftLabel: 'Packed by', rightLabel: 'Received by' });

      stampFooterOnAllPages(doc, { left, right, note: 'Generated by Safawala QC & Packing.' });
      doc.save(`Packing-Slip-${details.bookingNumber}.pdf`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={creating || items.length === 0} onClick={createSlip}>
      {creating ? <LoaderCircle className="animate-spin" /> : <FileText />}
      {creating ? 'Preparing…' : 'Packing slip'}
    </Button>
  );
}
