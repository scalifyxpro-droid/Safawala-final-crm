'use client';

import { useState } from 'react';
import { LoaderCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import {
  BRAND_DARK,
  MUTED,
  OK_GREEN,
  ROW_ALT,
  WARN_RED,
  randomOwnerPassword,
  drawSignOffLines,
  drawTableHeaderRow,
  loadBrandLogo,
  sectionBox,
  stampFooterOnAllPages,
} from '@/lib/pdf/brand';

export type CollectionSlipDetails = {
  jobId: string;
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  venue: string | null;
  collectedFrom: string;
  handedOverTo: string;
  completedBy: string;
  completedAt: string;
};

export type CollectionSlipItem = {
  itemName: string;
  sentQuantity: number;
  returnedQuantity: number;
  remarks: string;
};

export function CollectionSlipButton({
  details,
  items,
}: {
  details: CollectionSlipDetails;
  items: CollectionSlipItem[];
}) {
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
      doc.text('RENTAL COLLECTION SLIP', right, headerTop + 18, { align: 'right' });
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`Job: ${details.jobId}`, right, headerTop + 24, { align: 'right' });

      // ---- Job / event / hand-off info box ----
      let y = headerTop + headerHeight + 6;
      const boxH = 38;
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
      doc.text('EVENT & PICKUP', eventX + 2, by);
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
      by += 6.5;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_DARK);
      doc.text('Collected from:', left + 5, by);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(details.collectedFrom || '-', left + 33, by);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_DARK);
      doc.text('Handed to:', eventX + 2, by);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(details.handedOverTo || '-', eventX + 22, by);
      y += boxH + 6;

      // ---- Items table ----
      const nameX = left + 3;
      y = drawTableHeaderRow(doc, {
        x: left,
        y,
        w: boxWidth,
        columns: [
          { label: 'ITEM', x: nameX },
          { label: 'SENT', x: left + 128, align: 'right' },
          { label: 'COLLECTED', x: left + 151, align: 'right' },
          { label: 'STATUS', x: right - 3, align: 'right' },
        ],
      });
      items.forEach((item, index) => {
        if (y > 262) {
          doc.addPage();
          y = 20;
        }
        const itemLines = doc.splitTextToSize(item.itemName, 105) as string[];
        const remarkLines = item.remarks ? (doc.splitTextToSize(item.remarks, 105) as string[]) : [];
        const height = Math.max(10, itemLines.length * 4 + remarkLines.length * 3.5 + 4);
        if (index % 2 === 0) {
          doc.setFillColor(...ROW_ALT);
          doc.rect(left, y - 5, boxWidth, height, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BRAND_DARK);
        doc.text(itemLines, nameX, y);
        if (remarkLines.length) {
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(remarkLines, nameX, y + itemLines.length * 4);
          doc.setFontSize(9);
        }
        doc.setTextColor(...BRAND_DARK);
        doc.text(String(item.sentQuantity), left + 128, y, { align: 'right' });
        doc.text(String(item.returnedQuantity), left + 151, y, { align: 'right' });
        const complete = item.returnedQuantity === item.sentQuantity;
        doc.setTextColor(...(complete ? OK_GREEN : WARN_RED));
        doc.text(complete ? 'COMPLETE' : 'MISSING', right - 3, y, { align: 'right' });
        y += height;
      });

      y = Math.min(Math.max(y + 10, 235), 268);
      drawSignOffLines(doc, {
        left,
        right,
        y,
        leftLabel: `Collected by: ${details.completedBy}`,
        rightLabel: `Received by: ${details.handedOverTo}`,
        lineWidth: 65,
      });

      stampFooterOnAllPages(doc, {
        left,
        right,
        note: `Completed ${new Date(details.completedAt).toLocaleString('en-IN')} - Safawala Collection.`,
      });
      doc.save(`Collection-Slip-${details.bookingNumber}.pdf`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={creating} onClick={createSlip}>
      {creating ? <LoaderCircle className="animate-spin" /> : <Printer />}
      {creating ? 'Preparing…' : 'Collection slip'}
    </Button>
  );
}
