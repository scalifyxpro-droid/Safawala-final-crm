'use client';

import { useState } from 'react';
import { LoaderCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyDate, friendlyTime } from '@/lib/bookings';
import { BORDER_SOFT, BRAND_DARK, MUTED, OK_GREEN, ROW_ALT, ROW_TINT, WARN_RED, randomOwnerPassword, loadBrandLogo } from '@/lib/pdf/brand';

export type WarehousePickSlipDetails = {
  jobId: string;
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  venue: string | null;
};

export type WarehousePickSlipItem = {
  itemName: string;
  quantity: number;
  barcode: string | null;
  picked: boolean;
};

export function WarehousePickSlipButton({
  details,
  items,
  disabled = false,
}: {
  details: WarehousePickSlipDetails;
  items: WarehousePickSlipItem[];
  disabled?: boolean;
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
      const drawSlip = (top: number) => {
        const left = 12;
        const right = 198;
        const width = right - left;
        doc.setDrawColor(...BORDER_SOFT);
        doc.setFillColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.roundedRect(left, top, width, 133, 2, 2, 'FD');
        if (logo) {
          const logoH = 9;
          doc.addImage(logo.dataUrl, 'PNG', left + 5, top + 4, logoH * logo.ratio, logoH);
        } else {
          doc.setTextColor(...BRAND_DARK);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.text('SAFAWALA', left + 5, top + 10);
        }
        doc.setTextColor(...BRAND_DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('WAREHOUSE PICK SLIP', right - 5, top + 10, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text(`${details.jobId}  |  ${details.bookingNumber}`, right - 5, top + 17, { align: 'right' });

        let y = top + 27;
        const row = (label: string, value: string, x: number, rowWidth: number) => {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...BRAND_DARK);
          doc.setFontSize(6.5);
          doc.text(label, x, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...MUTED);
          doc.text(doc.splitTextToSize(value || '-', rowWidth - 25) as string[], x + 25, y);
        };
        row('Customer', details.customerName, left + 3, width / 2);
        row('Phone', details.customerPhone || '-', left + width / 2, width / 2);
        y += 6;
        row('Event', details.eventName, left + 3, width / 2);
        row('Date', `${friendlyDate(details.eventDate)}${details.eventTime ? ` · ${friendlyTime(details.eventTime)}` : ''}`, left + width / 2, width / 2);
        y += 6;
        row('Venue', details.venue || '-', left + 3, width);
        y += 8;
        doc.setFillColor(...ROW_TINT);
        doc.setDrawColor(...BORDER_SOFT);
        doc.setLineWidth(0.3);
        doc.rect(left + 2, y - 4, width - 4, 7, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_DARK);
        doc.setFontSize(6.5);
        doc.text('ITEM', left + 5, y);
        doc.text('BARCODE', left + 100, y);
        doc.text('QTY', left + 150, y, { align: 'right' });
        doc.text('STATUS', right - 5, y, { align: 'right' });
        y += 6;
        doc.setFontSize(6.5);
        items.forEach((item, index) => {
          const itemLines = doc.splitTextToSize(item.itemName, 90) as string[];
          const height = Math.max(6, itemLines.length * 3 + 2);
          if (y < top + 116) {
            if (index % 2 === 0) {
              doc.setFillColor(...ROW_ALT);
              doc.rect(left + 2, y - 4, width - 4, height, 'F');
            }
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...BRAND_DARK);
            doc.text(itemLines, left + 5, y);
            doc.setTextColor(...MUTED);
            doc.text(item.barcode || '-', left + 100, y);
            doc.setTextColor(...BRAND_DARK);
            doc.text(String(item.quantity), left + 150, y, { align: 'right' });
            doc.setTextColor(...(item.picked ? OK_GREEN : WARN_RED));
            doc.text(item.picked ? 'PICKED' : 'NOT PICKED', right - 5, y, { align: 'right' });
            y += height;
            doc.setDrawColor(205, 205, 205);
            doc.line(left + 2, y - 3, right - 2, y - 3);
          }
        });
        doc.setDrawColor(...BORDER_SOFT);
        doc.setLineWidth(0.3);
        doc.line(left + 5, top + 121, left + 55, top + 121);
        doc.line(right - 55, top + 121, right - 5, top + 121);
        doc.setTextColor(...MUTED);
        doc.setFontSize(6);
        doc.text('Picked by', left + 5, top + 126);
        doc.text('Checked by', right - 55, top + 126);
      };

      // Two identical branded copies, stacked on one A4 page for warehouse handover.
      drawSlip(7);
      drawSlip(151);
      doc.save(`Pick-Slip-${details.bookingNumber}.pdf`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={disabled || creating} onClick={createSlip}>
      {creating ? <LoaderCircle className="animate-spin" /> : <Printer />}
      {creating ? 'Preparing…' : 'Pick slip'}
    </Button>
  );
}
