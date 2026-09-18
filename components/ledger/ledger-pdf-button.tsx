'use client';

import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LedgerCustomer, LedgerTransaction } from '@/lib/ledger';
import { paymentMethodLabel } from '@/lib/ledger';
import {
  BORDER_SOFT,
  BRAND_DARK,
  LINE_FAINT,
  MUTED,
  ROW_TINT,
  drawDocumentHeader,
  loadBrandLogo,
  randomOwnerPassword,
  rupees,
  sectionBox,
  stampFooterOnAllPages,
} from '@/lib/pdf/brand';

const date = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
const time = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));

// Same font pairing as the sale/rental invoice: Lora (an elegant serif) for
// brand-voice moments — the document title, the customer's name, the
// summary totals — paired with Poppins (a clean geometric sans) for the
// dense, functional parts: the transaction table, contact details, the
// footer. Both are embedded from /public/fonts at generation time; if a
// font file fails to load for any reason the document falls back to the
// built-in Times/Helvetica rather than failing to generate.
const FALLBACK_DISPLAY_FONT = 'times';
const FALLBACK_BODY_FONT = 'helvetica';

// Fetches a font file from /public and returns raw base64 (no "data:"
// prefix) — the form jsPDF's addFileToVFS expects for embedding a custom
// font. Returns null on any failure so the caller can fall back to a
// built-in PDF font rather than breaking PDF generation.
async function loadFontBase64(src: string): Promise<string | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

export function LedgerPdfButton({
  customer,
  transactions,
  totals,
  period,
}: {
  customer: LedgerCustomer;
  transactions: LedgerTransaction[];
  totals: { totalBills: number; totalBilling: number; totalPaid: number; outstanding: number };
  period: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const [{ jsPDF }, logo, loraRegular, loraBold, poppinsRegular, poppinsBold] = await Promise.all([
        import('jspdf'),
        loadBrandLogo(),
        loadFontBase64('/fonts/Lora-Regular.ttf'),
        loadFontBase64('/fonts/Lora-Bold.ttf'),
        loadFontBase64('/fonts/Poppins-Regular.ttf'),
        loadFontBase64('/fonts/Poppins-Bold.ttf'),
      ]);
      const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
        encryption: {
          userPassword: '',
          ownerPassword: randomOwnerPassword(),
          userPermissions: ['print', 'copy'],
        },
      });

      // Embed Lora (display/brand-voice serif) and Poppins (body/data sans)
      // if both weights of each fetched successfully; otherwise fall back to
      // the built-in Times/Helvetica so PDF generation never fails outright
      // over a missing font file.
      let displayFont: string = FALLBACK_DISPLAY_FONT;
      let bodyFont: string = FALLBACK_BODY_FONT;
      try {
        if (loraRegular && loraBold) {
          doc.addFileToVFS('Lora-Regular.ttf', loraRegular);
          doc.addFont('Lora-Regular.ttf', 'Lora', 'normal');
          doc.addFileToVFS('Lora-Bold.ttf', loraBold);
          doc.addFont('Lora-Bold.ttf', 'Lora', 'bold');
          displayFont = 'Lora';
        }
        if (poppinsRegular && poppinsBold) {
          doc.addFileToVFS('Poppins-Regular.ttf', poppinsRegular);
          doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
          doc.addFileToVFS('Poppins-Bold.ttf', poppinsBold);
          doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
          bodyFont = 'Poppins';
        }
      } catch {
        displayFont = FALLBACK_DISPLAY_FONT;
        bodyFont = FALLBACK_BODY_FONT;
      }

      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const left = 12;
      const right = width - 12;
      const columns = [
        { label: 'Date', x: left, w: 20, align: 'left' as const },
        { label: 'Time', x: left + 20, w: 19, align: 'left' as const },
        { label: 'Bill No.', x: left + 39, w: 36, align: 'left' as const },
        { label: 'Type', x: left + 75, w: 17, align: 'left' as const },
        { label: 'Transaction', x: left + 92, w: 23, align: 'left' as const },
        { label: 'Bill Amount', x: left + 115, w: 28, align: 'right' as const },
        { label: 'Payment', x: left + 143, w: 27, align: 'right' as const },
        { label: 'Mode', x: left + 170, w: 25, align: 'left' as const },
        { label: 'Reference', x: left + 195, w: 28, align: 'left' as const },
        { label: 'Balance', x: left + 223, w: 28, align: 'right' as const },
        { label: 'Status', x: left + 251, w: 22, align: 'left' as const },
      ];
      let y = 0;

      const tableHeader = () => {
        doc.setFillColor(...ROW_TINT);
        doc.rect(left, y, right - left, 8, 'F');
        doc.setDrawColor(...BORDER_SOFT);
        doc.setLineWidth(0.16);
        doc.line(left, y, right, y);
        doc.line(left, y + 8, right, y + 8);
        doc.setFont(bodyFont, 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...BRAND_DARK);
        columns.forEach((column) =>
          doc.text(
            column.label,
            column.align === 'right' ? column.x + column.w - 1.5 : column.x + 1.5,
            y + 5.5,
            { align: column.align },
          ),
        );
        y += 8.5;
      };

      const firstHeader = () => {
        drawDocumentHeader(doc, {
          left,
          right,
          logo,
          docNumber: 'CUSTOMER LEDGER',
          docLabel: 'Statement of Account',
          dateLabel: period,
          displayFont,
          bodyFont,
        });

        y = 48;
        const boxHeight = 26;
        sectionBox(doc, left, y, right - left, boxHeight);
        const infoY = y + 8;
        doc.setFont(displayFont, 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...BRAND_DARK);
        doc.text(customer.name, left + 5, infoY);
        doc.setFont(bodyFont, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text(`Customer ID: ${customer.id}   Mobile: ${customer.phone}`, left + 5, infoY + 5.5);
        doc.text(customer.email || 'Email not available', left + 5, infoY + 10.5);

        const summary = [
          ['Total Billing', rupees(totals.totalBilling)],
          ['Total Received', rupees(totals.totalPaid)],
          ['Outstanding', rupees(totals.outstanding)],
          ['Total Bills', String(totals.totalBills)],
        ] as const;
        const tilesX = left + (right - left) * 0.46;
        const tileWidth = (right - 5 - tilesX) / summary.length;
        summary.forEach(([label, value], index) => {
          const x = tilesX + index * tileWidth;
          doc.setFont(bodyFont, 'bold');
          doc.setTextColor(...MUTED);
          doc.setFontSize(6.8);
          doc.text(label.toUpperCase(), x, infoY);
          doc.setFont(displayFont, 'bold');
          doc.setTextColor(...BRAND_DARK);
          doc.setFontSize(10.5);
          doc.text(value, x, infoY + 7);
        });

        y += boxHeight + 6;
        tableHeader();
      };

      firstHeader();
      for (const [rowIndex, transaction] of transactions.entries()) {
        const rowHeight = 9.4;
        if (y + rowHeight > height - 10) {
          doc.addPage('a4', 'landscape');
          y = 11;
          doc.setFont(displayFont, 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(...BRAND_DARK);
          doc.text(`CUSTOMER LEDGER - ${customer.name}`, left, y);
          doc.setFont(bodyFont, 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(period, right, y, { align: 'right' });
          y += 4;
          tableHeader();
        }
        const values = [
          date(transaction.occurredAt),
          time(transaction.occurredAt),
          transaction.bookingNumber,
          transaction.bookingType === 'sale' ? 'Sale' : 'Rental',
          transaction.transactionType === 'bill' ? 'Bill' : 'Payment',
          rupees(transaction.billAmount),
          rupees(transaction.paymentAmount),
          transaction.paymentMethod ? paymentMethodLabel(transaction.paymentMethod) : '-',
          transaction.referenceNumber || '-',
          rupees(transaction.balance),
          transaction.status === 'completed' ? 'Paid' : 'Due',
        ];
        if (rowIndex % 2 === 1) {
          doc.setFillColor(251, 250, 248);
          doc.rect(left, y, right - left, rowHeight, 'F');
        }
        doc.setFont(bodyFont, 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(...BRAND_DARK);
        columns.forEach((column, index) => {
          const clipped = doc.splitTextToSize(values[index], column.w - 3)[0] || '-';
          doc.text(
            clipped,
            column.align === 'right' ? column.x + column.w - 1.5 : column.x + 1.5,
            y + 6.2,
            { align: column.align },
          );
        });
        doc.setDrawColor(...LINE_FAINT);
        doc.setLineWidth(0.1);
        doc.line(left, y + rowHeight, right, y + rowHeight);
        y += rowHeight;
      }
      if (!transactions.length) {
        doc.setFont(bodyFont, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text('No transactions match the selected ledger period.', left + 2, y + 8);
      }

      const generated = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date());
      stampFooterOnAllPages(doc, {
        left,
        right,
        y: height - 10,
        note: `Generated ${generated} - Computer generated statement`,
        bodyFont,
      });

      const safeName = customer.name.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
      const filename = `${safeName || 'Customer'}_Ledger.pdf`;
      const blobUrl = URL.createObjectURL(doc.output('blob'));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={download} disabled={busy}>
      {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
      <span className="hidden sm:inline">Download PDF</span>
    </Button>
  );
}
