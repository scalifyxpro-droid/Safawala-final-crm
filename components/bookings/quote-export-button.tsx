'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { friendlyDate, money, quoteState, QUOTE_STATE_LABEL } from '@/lib/bookings';

export type ExportableQuote = {
  booking_number: string;
  booking_type: string;
  status: string;
  total: number;
  event_name: string;
  event_date: string;
  created_at: string;
  customers: { name: string; phone: string } | null;
};

function csvCell(value: string) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ExportQuotesButton({ quotes }: { quotes: ExportableQuote[] }) {
  function exportCsv() {
    const header = [
      'Quote #',
      'Customer',
      'Phone',
      'Type',
      'Event',
      'Event date',
      'Amount',
      'Status',
      'Created',
    ];
    const rows = quotes.map((quote) => [
      quote.booking_number,
      quote.customers?.name ?? '',
      quote.customers?.phone ?? '',
      quote.booking_type,
      quote.event_name,
      friendlyDate(quote.event_date),
      money(quote.total),
      QUOTE_STATE_LABEL[quoteState(quote.status)],
      friendlyDate(quote.created_at),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `safawala-quotes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={exportCsv}
      disabled={quotes.length === 0}
    >
      <Download />
      <span className="hidden md:inline">Export</span>
    </Button>
  );
}
