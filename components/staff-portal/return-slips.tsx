'use client';

import { useState } from 'react';
import { FileCheck2, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyDate } from '@/lib/bookings';
import {
  BRAND_DARK,
  MUTED,
  ROW_ALT,
  randomOwnerPassword,
  drawTableHeaderRow,
  loadBrandLogo,
  stampFooterOnAllPages,
} from '@/lib/pdf/brand';

export type ReturnSlipDetails = {
  jobId: string;
  bookingNumber: string;
  customerName: string;
  eventName: string;
  eventDate: string;
  completedBy: string;
  completedAt: string;
};

type ReturnQcSlipItem = {
  itemName: string;
  returnedQuantity: number;
  goodQuantity: number;
  damagedQuantity: number;
  remarks: string;
};

type ReturnWarehouseSlipItem = {
  itemName: string;
  usableQuantity: number;
  damagedRepairQuantity: number;
  missingLostQuantity: number;
  storageLocation: string;
  remarks: string;
};

async function downloadSlip(
  title: string,
  details: ReturnSlipDetails,
  headings: string[],
  rows: string[][],
  filename: string,
  footerNote: string,
) {
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
  doc.text(title, right, headerTop + 18, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Job: ${details.jobId}`, right, headerTop + 24, { align: 'right' });

  // ---- Job summary line ----
  let y = headerTop + headerHeight + 11;
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer:', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(details.customerName, left + 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_DARK);
  doc.text('Event date:', right - 60, y, { align: 'left' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(friendlyDate(details.eventDate), right, y, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_DARK);
  doc.text('Event:', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(details.eventName, left + 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_DARK);
  doc.text('Completed by:', right - 60, y, { align: 'left' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(details.completedBy, right, y, { align: 'right' });

  // ---- Records table ----
  y += 10;
  const columnWidth = boxWidth / headings.length;
  y = drawTableHeaderRow(doc, {
    x: left,
    y,
    w: boxWidth,
    columns: headings.map((heading, index) => ({ label: heading, x: left + 3 + columnWidth * index })),
  });

  rows.forEach((row, rowIndex) => {
    const wrapped = row.map((value) => doc.splitTextToSize(value || '-', columnWidth - 5) as string[]);
    const height = Math.max(10, ...wrapped.map((lines) => lines.length * 4 + 3));
    if (y + height > 275) {
      doc.addPage();
      y = 20;
    }
    if (rowIndex % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(left, y, boxWidth, height, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND_DARK);
    wrapped.forEach((lines, index) => doc.text(lines, left + 3 + columnWidth * index, y + 5));
    y += height;
  });

  stampFooterOnAllPages(doc, { left, right, note: footerNote });
  doc.save(filename);
}

export function ReturnQcSlipButton({ details, items }: { details: ReturnSlipDetails; items: ReturnQcSlipItem[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={creating}
      onClick={async () => {
        setCreating(true);
        try {
          await downloadSlip(
            'RETURN QC SLIP',
            details,
            ['PRODUCT', 'RETURNED', 'GOOD', 'DAMAGED', 'REMARK'],
            items.map((item) => [item.itemName, String(item.returnedQuantity), String(item.goodQuantity), String(item.damagedQuantity), item.remarks]),
            `Return-QC-${details.bookingNumber}.pdf`,
            `Completed ${new Date(details.completedAt).toLocaleString('en-IN')} - Safawala Event Operations.`,
          );
        } finally {
          setCreating(false);
        }
      }}
    >
      {creating ? <LoaderCircle className="animate-spin" /> : <FileCheck2 />}
      {creating ? 'Preparing…' : 'Return QC slip'}
    </Button>
  );
}

export function ReturnWarehouseSlipButton({ details, items }: { details: ReturnSlipDetails; items: ReturnWarehouseSlipItem[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={creating}
      onClick={async () => {
        setCreating(true);
        try {
          await downloadSlip(
            'RETURN WAREHOUSE RECEIPT',
            details,
            ['PRODUCT', 'USABLE', 'REPAIR', 'MISSING', 'LOCATION'],
            items.map((item) => [item.itemName, String(item.usableQuantity), String(item.damagedRepairQuantity), String(item.missingLostQuantity), item.storageLocation || item.remarks]),
            `Return-Warehouse-${details.bookingNumber}.pdf`,
            `Completed ${new Date(details.completedAt).toLocaleString('en-IN')} - Safawala Event Operations.`,
          );
        } finally {
          setCreating(false);
        }
      }}
    >
      {creating ? <LoaderCircle className="animate-spin" /> : <FileCheck2 />}
      {creating ? 'Preparing…' : 'Receiving slip'}
    </Button>
  );
}
