'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarRange,
  IndianRupee,
  Landmark,
  Printer,
  ReceiptText,
  Search,
  WalletCards,
  X,
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { LedgerPdfButton } from '@/components/ledger/ledger-pdf-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { money } from '@/lib/bookings';
import {
  buildLedgerTransactions,
  ledgerTotals,
  paymentMethodLabel,
  type LedgerBooking,
  type LedgerCustomer,
  type LedgerTransaction,
} from '@/lib/ledger';

const transactionDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
const transactionTime = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
const localDateKey = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export function CustomerLedgerDetail({
  customer,
  bookings,
  loadError,
}: {
  customer: LedgerCustomer;
  bookings: LedgerBooking[];
  loadError: string;
}) {
  const transactions = useMemo(() => buildLedgerTransactions(bookings), [bookings]);
  const totals = useMemo(() => ledgerTotals(bookings), [bookings]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'sale' | 'rental'>('all');
  const [transactionType, setTransactionType] = useState<'all' | 'bill' | 'payment'>('all');
  const [status, setStatus] = useState<'all' | 'completed' | 'uncompleted'>('all');
  const [method, setMethod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedPayment, setSelectedPayment] = useState<LedgerTransaction | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const dateKey = localDateKey(transaction.occurredAt);
      const matchesSearch = !query || [
        transaction.bookingNumber,
        transaction.eventName,
        transaction.referenceNumber,
        paymentMethodLabel(transaction.paymentMethod),
      ].some((value) => value?.toLowerCase().includes(query));
      return matchesSearch &&
        (type === 'all' || transaction.bookingType === type) &&
        (transactionType === 'all' || transaction.transactionType === transactionType) &&
        (status === 'all' || transaction.status === status) &&
        (method === 'all' || transaction.paymentMethod === method) &&
        (!fromDate || dateKey >= fromDate) &&
        (!toDate || dateKey <= toDate);
    });
  }, [fromDate, method, search, status, toDate, transactionType, transactions, type]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const resetPage = () => setPage(1);
  const period = fromDate || toDate
    ? `Period: ${fromDate || 'Beginning'} to ${toDate || 'Today'}`
    : 'Period: All time';

  return (
    <div id="customer-ledger-print" className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title={`${customer.name} · Ledger`}
        subtitle={`${customer.phone} · ${period}`}
        backHref="/ledger"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /><span className="hidden sm:inline">Print</span>
            </Button>
            <LedgerPdfButton customer={customer} transactions={filtered} totals={totals} period={period} />
          </>
        }
      />

      <section className="ledger-print-heading rounded-xl border bg-white dark:bg-card p-5 shadow-level-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Customer ledger</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{customer.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Customer ID: {customer.id} · {customer.phone}</p>
            <p className="mt-1 text-sm text-muted-foreground">{customer.email || 'Email not available'}</p>
            {customer.address ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{customer.address}</p> : null}
          </div>
          <div className="rounded-lg border bg-[#fcfaf7] dark:bg-[#241e17] px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><CalendarRange className="size-4 text-primary" />{period}</p>
          </div>
        </div>
      </section>

      <section className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Metric icon={<IndianRupee />} label="Total billing" value={money(totals.totalBilling)} note={`${totals.totalBills} bills`} />
        <Metric icon={<ReceiptText />} label="Total received" value={money(totals.totalPaid)} note="Recorded payments" tone="success" />
        <Metric icon={<WalletCards />} label="Outstanding" value={money(totals.outstanding)} note="Current balance due" tone="warning" />
        <Metric icon={<Landmark />} label="Total bills" value={String(totals.totalBills)} note="Sales and rentals" />
      </section>

      {loadError ? (
        <Alert variant="destructive"><AlertTitle>Ledger could not be loaded</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>
      ) : null}

      <Card className="ledger-transaction-card gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0 print:hidden">
        <CardHeader className="ledger-controls border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4 print:hidden">
          <CardTitle>Transaction history</CardTitle>
          <p className="text-xs text-muted-foreground">Bills and payments in their actual date and time sequence.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(5,140px)]">
            <label className="relative">
              <span className="sr-only">Search transactions</span>
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Bill, event or reference…" className="h-10 w-full rounded-lg border bg-white dark:bg-card pl-9 pr-3 text-sm outline-none focus:border-ring" />
            </label>
            <Filter value={type} onChange={(value) => { setType(value as typeof type); resetPage(); }} label="Booking type" options={[["all","All types"],["sale","Sales"],["rental","Rentals"]]} />
            <Filter value={transactionType} onChange={(value) => { setTransactionType(value as typeof transactionType); resetPage(); }} label="Transaction type" options={[["all","All transactions"],["bill","Bills"],["payment","Payments"]]} />
            <Filter value={status} onChange={(value) => { setStatus(value as typeof status); resetPage(); }} label="Status" options={[["all","All statuses"],["uncompleted","Uncompleted"],["completed","Completed"]]} />
            <Filter value={method} onChange={(value) => { setMethod(value); resetPage(); }} label="Payment method" options={[["all","All methods"],["cash","Cash"],["upi","UPI"],["card","Card"],["bank_transfer","Bank transfer"],["other","Other"]]} />
            <Button type="button" variant="outline" className="h-10 bg-white dark:bg-card" onClick={() => { setSearch(''); setType('all'); setTransactionType('all'); setStatus('all'); setMethod('all'); setFromDate(''); setToDate(''); resetPage(); }}>Clear</Button>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <DateField label="From" value={fromDate} onChange={(value) => { setFromDate(value); resetPage(); }} />
            <DateField label="To" value={toDate} onChange={(value) => { setToDate(value); resetPage(); }} />
          </div>
        </CardHeader>
        <div className="print:hidden">
          <ListPagination total={filtered.length} page={safePage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); resetPage(); }} itemLabel="transactions" />
        </div>
        <CardContent className="p-0">
          {paged.length ? (
            <div className="overflow-x-auto">
              <table className="ledger-table w-full min-w-[1320px] text-left text-xs">
                <thead className="border-b bg-[#f7f4ef] dark:bg-[#241e17] text-muted-foreground">
                  <tr>{['Date','Time','Bill No.','Type','Transaction','Bill amount','Payment','Mode','Reference','Balance','Status'].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {paged.map((transaction) => (
                    <tr key={transaction.key} className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]">
                      <td className="whitespace-nowrap px-4 py-3">{transactionDate(transaction.occurredAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{transactionTime(transaction.occurredAt)}</td>
                      <td className="px-4 py-3"><Link href={`/bookings/${transaction.bookingId}`} className="font-semibold text-primary hover:underline">{transaction.bookingNumber}</Link><p className="mt-1 max-w-40 truncate text-[11px] text-muted-foreground">{transaction.eventName}</p></td>
                      <td className="px-4 py-3 capitalize">{transaction.bookingType}</td>
                      <td className="px-4 py-3">{transaction.transactionType === 'payment' ? <button type="button" onClick={() => setSelectedPayment(transaction)} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Badge variant="outline" className="cursor-pointer capitalize hover:border-primary">Payment</Badge></button> : <Badge variant="outline">Bill</Badge>}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{transaction.billAmount === null ? '—' : money(transaction.billAmount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-emerald-700">{transaction.paymentAmount === null ? '—' : money(transaction.paymentAmount)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{paymentMethodLabel(transaction.paymentMethod)}</td>
                      <td className="max-w-40 truncate px-4 py-3 text-muted-foreground">{transaction.referenceNumber || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">{money(transaction.balance)}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={transaction.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>{transaction.status === 'completed' ? 'Completed' : 'Uncompleted'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center p-8 text-center"><div><Landmark className="mx-auto size-8 text-primary" /><h3 className="mt-3 font-semibold">No transactions found</h3><p className="mt-1 text-sm text-muted-foreground">Adjust the ledger filters or date range.</p></div></div>
          )}
        </CardContent>
      </Card>

      <section className="hidden print:block">
        <h3 className="mb-3 text-base font-semibold">Transaction history</h3>
        <table className="ledger-table w-full text-left text-[8px]">
          <thead className="border-y border-[#b9aa97] bg-[#eee7dc] text-[#2f261d]">
            <tr>{['Date','Time','Bill No.','Type','Transaction','Bill amount','Payment','Mode','Reference','Balance','Status'].map((heading) => <th key={heading} className="px-1.5 py-2 font-semibold tracking-wide">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((transaction) => (
              <tr key={`print-${transaction.key}`} className="border-b">
                <td className="whitespace-nowrap px-1.5 py-2">{transactionDate(transaction.occurredAt)}</td>
                <td className="whitespace-nowrap px-1.5 py-2">{transactionTime(transaction.occurredAt)}</td>
                <td className="px-1.5 py-2 font-semibold">{transaction.bookingNumber}</td>
                <td className="px-1.5 py-2 capitalize">{transaction.bookingType}</td>
                <td className="px-1.5 py-2 capitalize">{transaction.transactionType}</td>
                <td className="whitespace-nowrap px-1.5 py-2">{transaction.billAmount === null ? '—' : money(transaction.billAmount)}</td>
                <td className="whitespace-nowrap px-1.5 py-2">{transaction.paymentAmount === null ? '—' : money(transaction.paymentAmount)}</td>
                <td className="px-1.5 py-2">{paymentMethodLabel(transaction.paymentMethod)}</td>
                <td className="max-w-24 truncate px-1.5 py-2">{transaction.referenceNumber || '—'}</td>
                <td className="whitespace-nowrap px-1.5 py-2 font-semibold">{money(transaction.balance)}</td>
                <td className="px-1.5 py-2">{transaction.status === 'completed' ? 'Completed' : 'Uncompleted'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedPayment ? <PaymentDetails transaction={selectedPayment} onClose={() => setSelectedPayment(null)} /> : null}
    </div>
  );
}

function Filter({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: string[][] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm outline-none focus:border-ring">{options.map(([key,text]) => <option key={key} value={key}>{text}</option>)}</select>;
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs text-muted-foreground"><span className="mb-1 block">{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm text-foreground outline-none focus:border-ring" /></label>;
}
function Metric({ icon, label, value, note, tone = 'default' }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: 'default' | 'success' | 'warning' }) {
  const iconTone = tone === 'success' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : tone === 'warning' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-accent text-primary ring-[#e4d2b6]';
  return <Card className="gap-0 border-border py-0 shadow-level-1 ring-0"><CardContent className="flex items-center justify-between gap-3 p-5"><div className="min-w-0"><p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xl font-semibold tracking-[-0.03em]">{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{note}</p></div><span className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 [&_svg]:size-4 ${iconTone}`}>{icon}</span></CardContent></Card>;
}
function PaymentDetails({ transaction, onClose }: { transaction: LedgerTransaction; onClose: () => void }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#211d18]/70 p-4 backdrop-blur-sm print:hidden"><dialog open aria-labelledby="payment-details-title" className="m-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[22px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)]"><div className="flex items-start justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Payment transaction</p><h2 id="payment-details-title" className="mt-1 text-lg font-semibold">{transaction.bookingNumber}</h2></div><button type="button" onClick={onClose} aria-label="Close payment details" className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground"><X className="size-4" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><Detail label="Payment date" value={transactionDate(transaction.occurredAt)} /><Detail label="Payment time" value={transactionTime(transaction.occurredAt)} /><Detail label="Amount" value={money(transaction.paymentAmount || 0)} /><Detail label="Payment mode" value={paymentMethodLabel(transaction.paymentMethod)} /><Detail label="Reference number" value={transaction.referenceNumber || 'Not provided'} /><Detail label="Balance after payment" value={money(transaction.balance)} /><Detail label="Related bill" value={transaction.bookingNumber} /><Detail label="Booking type" value={transaction.bookingType === 'sale' ? 'Sale' : 'Rental'} /><div className="sm:col-span-2"><Detail label="Remarks" value={transaction.notes || 'No remarks added'} /></div></div><div className="flex justify-end gap-2 border-t p-4"><Button variant="outline" onClick={onClose}>Close</Button><Button render={<Link href={`/bookings/${transaction.bookingId}`} />}>View bill</Button></div></dialog></div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1.5 text-sm font-medium">{value}</p></div>; }
