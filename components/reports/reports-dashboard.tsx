'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Download,
  Package,
  RefreshCw,
  ShoppingBag,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardHeader } from '@/components/layout/dashboard-header';

export type ReportBooking = {
  id: number;
  booking_number: string;
  booking_type: 'sale' | 'rental';
  status: string;
  event_date: string;
  total: number;
  paid_amount: number;
  balance_amount: number;
  customers?: { name: string } | null;
};
export type ReportProduct = { id: number; name: string; category: string | null; stock_quantity: number; sale_price: number; rental_price: number; reorder_level: number; is_active: boolean };
export type ReportData = { bookings: ReportBooking[]; products: ReportProduct[]; customerCount: number; expenseTotal: number; expenseCount: number; staffCount: number; start: string; end: string };

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const tabs = ['Overview', 'Bookings', 'Inventory', 'Expenses', 'Pending'] as const;
type Tab = (typeof tabs)[number];

export function ReportsDashboard({ data }: { data: ReportData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');
  const [start, setStart] = useState(data.start);
  const [end, setEnd] = useState(data.end);
  const [dateOpen, setDateOpen] = useState(false);
  const bookings = data.bookings;
  const revenue = bookings.reduce((sum, row) => sum + row.total, 0);
  const collected = bookings.reduce((sum, row) => sum + row.paid_amount, 0);
  const pending = bookings.reduce((sum, row) => sum + row.balance_amount, 0);
  const rentals = bookings.filter((row) => row.booking_type === 'rental');
  const sales = bookings.filter((row) => row.booking_type === 'sale');
  const totalStock = data.products.reduce((sum, product) => sum + product.stock_quantity, 0);
  const inventoryValue = data.products.reduce((sum, product) => sum + product.stock_quantity * product.sale_price, 0);
  const lowStock = data.products.filter((product) => product.is_active && product.stock_quantity <= product.reorder_level);
  const netProfit = Math.max(0, collected - data.expenseTotal);
  const collectionRate = revenue ? Math.round((collected / revenue) * 100) : 0;

  const monthly = useMemo(() => {
    const result: { label: string; rental: number; sale: number }[] = [];
    const cursor = new Date(`${data.end}T12:00:00`);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - 5);
    for (let index = 0; index < 6; index += 1) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      result.push({ label: cursor.toLocaleString('en-IN', { month: 'short' }), rental: 0, sale: 0 });
      bookings.forEach((booking) => {
        const date = new Date(`${booking.event_date}T12:00:00`);
        if (date.getFullYear() === year && date.getMonth() === month) {
          result[index][booking.booking_type] += booking.total;
        }
      });
      cursor.setMonth(month + 1);
    }
    return result;
  }, [bookings, data.end]);
  const maxMonth = Math.max(...monthly.flatMap((month) => [month.rental, month.sale]), 1);
  const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const applyDates = () => { setDateOpen(false); router.push(`/reports?start=${start}&end=${end}`); };
  const refresh = () => router.refresh();
  const exportReport = () => {
    const rows = [
      ['Booking', 'Type', 'Event date', 'Customer', 'Total', 'Paid', 'Pending'],
      ...bookings.map((booking) => [booking.booking_number, booking.booking_type, booking.event_date, booking.customers?.name ?? '', String(booking.total), String(booking.paid_amount), String(booking.balance_amount)]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `safawala-report-${data.start}-to-${data.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <DashboardHeader title="Business Reports" subtitle="Revenue, bookings, inventory and payment insights" backHref="/dashboard" actions={<><Button variant="outline" size="sm" onClick={refresh}><RefreshCw /> Refresh</Button><Button size="sm" onClick={exportReport}><Download /> Export</Button></>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Button variant="outline" onClick={() => setDateOpen((open) => !open)}><CalendarDays /> {formatDate(data.start)} – {formatDate(data.end)}</Button>
          {dateOpen ? <div className="absolute left-0 top-12 z-20 w-[min(92vw,390px)] rounded-xl border border-border bg-white p-4 shadow-level-2 dark:bg-card"><p className="mb-3 text-sm font-semibold">Select report date range</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">From<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs font-medium text-muted-foreground">To<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => { setStart(data.start); setEnd(data.end); setDateOpen(false); }}>Clear</Button><Button size="sm" onClick={applyDates}>Done</Button></div></div> : null}
        </div>
        <p className="text-xs text-muted-foreground">Showing confirmed bookings within the selected period</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { label: 'Total Revenue', value: money(revenue), Icon: CircleDollarSign, tone: 'text-emerald-700' },
          { label: 'Collected', value: money(collected), Icon: CircleDollarSign, tone: 'text-sky-700' },
          { label: 'Pending', value: money(pending), Icon: CircleDollarSign, tone: 'text-amber-700' },
          { label: 'Net Profit', value: money(netProfit), Icon: BarChart3, tone: 'text-primary' },
        ] as { label: string; value: string; Icon: LucideIcon; tone: string }[]).map(({ label, value, Icon, tone }) => <Card key={label} className="border-border shadow-level-1"><CardContent className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className={`size-4 ${tone}`} />{label}</div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p></CardContent></Card>)}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-[#f5f1eb] p-1 sm:grid-cols-5 dark:bg-muted">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === item ? 'bg-white text-foreground shadow-sm dark:bg-card' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div>
      {tab === 'Overview' ? <Overview monthly={monthly} maxMonth={maxMonth} rentals={rentals} sales={sales} customerCount={data.customerCount} productCount={data.products.length} totalStock={totalStock} expenseTotal={data.expenseTotal} collectionRate={collectionRate} /> : null}
      {tab === 'Bookings' ? <BookingsReport rentals={rentals} sales={sales} revenue={revenue} collected={collected} pending={pending} /> : null}
      {tab === 'Inventory' ? <InventoryReport products={data.products} totalStock={totalStock} inventoryValue={inventoryValue} lowStock={lowStock} /> : null}
      {tab === 'Expenses' ? <ExpensesReport expenseTotal={data.expenseTotal} expenseCount={data.expenseCount} staffCount={data.staffCount} /> : null}
      {tab === 'Pending' ? <PendingReport bookings={bookings.filter((booking) => booking.balance_amount > 0)} collected={collected} pending={pending} collectionRate={collectionRate} /> : null}
    </div>
  );
}

function Overview({ monthly, maxMonth, rentals, sales, customerCount, productCount, totalStock, expenseTotal, collectionRate }: { monthly: { label: string; rental: number; sale: number }[]; maxMonth: number; rentals: ReportBooking[]; sales: ReportBooking[]; customerCount: number; productCount: number; totalStock: number; expenseTotal: number; collectionRate: number }) {
  const quickStats: { label: string; value: string | number; Icon: LucideIcon }[] = [
    { label: 'Total customers', value: customerCount, Icon: UsersRound },
    { label: 'Total bookings', value: rentals.length + sales.length, Icon: ShoppingBag },
    { label: 'Products', value: productCount, Icon: Package },
    { label: 'Total stock', value: totalStock, Icon: Package },
    { label: 'Expenses', value: money(expenseTotal), Icon: CircleDollarSign },
    { label: 'Collection rate', value: `${collectionRate}%`, Icon: BarChart3 },
  ];
  return <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><Card className="border-border shadow-level-1 xl:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-4 text-primary" />Revenue trend</CardTitle></CardHeader><CardContent><div className="flex h-64 items-end gap-3 border-b border-border px-2 pb-2 sm:gap-6">{monthly.map((month) => <div key={month.label} className="flex min-w-0 flex-1 items-end justify-center gap-1.5"><div title={`Rentals ${money(month.rental)}`} className="w-1/2 rounded-t bg-[#4b83e5] transition-all" style={{ height: `${Math.max(4, (month.rental / maxMonth) * 100)}%` }} /><div title={`Sales ${money(month.sale)}`} className="w-1/2 rounded-t bg-[#16b88a] transition-all" style={{ height: `${Math.max(4, (month.sale / maxMonth) * 100)}%` }} /><span className="absolute mt-[280px] text-xs text-muted-foreground">{month.label}</span></div>)}</div><div className="mt-5 flex justify-center gap-5 text-xs text-muted-foreground"><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#4b83e5]" />Rentals</span><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#16b88a]" />Sales</span></div></CardContent></Card><Card className="border-border shadow-level-1"><CardHeader><CardTitle className="text-base">Revenue mix</CardTitle></CardHeader><CardContent><div className="mx-auto grid size-44 place-items-center rounded-full" style={{ background: `conic-gradient(#4b83e5 0 ${(rentals.length / Math.max(rentals.length + sales.length, 1)) * 100}%, #16b88a 0 100%)` }}><div className="grid size-24 place-items-center rounded-full bg-white text-center dark:bg-card"><strong className="text-xl">{rentals.length + sales.length}</strong><span className="text-[11px] text-muted-foreground">bookings</span></div></div><div className="mt-5 flex justify-center gap-5 text-xs"><span className="text-[#4b83e5]">Rentals {rentals.length}</span><span className="text-[#16b88a]">Sales {sales.length}</span></div></CardContent></Card><Card className="border-border shadow-level-1"><CardHeader><CardTitle className="text-base">Quick stats</CardTitle></CardHeader><CardContent className="space-y-2">{quickStats.map(({ label, value, Icon }) => <div key={label} className="flex items-center justify-between rounded-lg bg-[#faf8f4] px-3 py-2.5 text-sm dark:bg-muted"><span className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4 text-primary" />{label}</span><strong>{value}</strong></div>)}</CardContent></Card></div>;
}

function BookingsReport({ rentals, sales, revenue, collected, pending }: { rentals: ReportBooking[]; sales: ReportBooking[]; revenue: number; collected: number; pending: number }) { return <Card className="border-border shadow-level-1"><CardHeader><CardTitle className="text-base">Bookings summary</CardTitle></CardHeader><CardContent><ReportTable headers={['Type', 'Orders', 'Revenue', 'Collected', 'Pending', 'Collection %']} rows={[['Rentals', rentals.length, money(rentals.reduce((s, b) => s + b.total, 0)), money(rentals.reduce((s, b) => s + b.paid_amount, 0)), money(rentals.reduce((s, b) => s + b.balance_amount, 0)), `${rentals.length ? Math.round((rentals.reduce((s, b) => s + b.paid_amount, 0) / Math.max(rentals.reduce((s, b) => s + b.total, 0), 1)) * 100) : 0}%`], ['Sales', sales.length, money(sales.reduce((s, b) => s + b.total, 0)), money(sales.reduce((s, b) => s + b.paid_amount, 0)), money(sales.reduce((s, b) => s + b.balance_amount, 0)), `${sales.length ? Math.round((sales.reduce((s, b) => s + b.paid_amount, 0) / Math.max(sales.reduce((s, b) => s + b.total, 0), 1)) * 100) : 0}%`], ['Total', rentals.length + sales.length, money(revenue), money(collected), money(pending), `${revenue ? Math.round((collected / revenue) * 100) : 0}%`]]} /></CardContent></Card>; }

function InventoryReport({ products, totalStock, inventoryValue, lowStock }: { products: ReportProduct[]; totalStock: number; inventoryValue: number; lowStock: ReportProduct[] }) { const categories = Object.entries(products.reduce<Record<string, { count: number; stock: number; value: number }>>((acc, product) => { const key = product.category || 'Uncategorized'; acc[key] ??= { count: 0, stock: 0, value: 0 }; acc[key].count += 1; acc[key].stock += product.stock_quantity; acc[key].value += product.stock_quantity * product.sale_price; return acc; }, {})); return <div className="grid gap-5 xl:grid-cols-2"><div className="grid gap-3 sm:grid-cols-3 xl:col-span-2">{[['Products', products.length], ['Total stock', totalStock], ['Inventory value', money(inventoryValue)]].map(([label, value]) => <Card key={String(label)} className="border-border shadow-level-1"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div><Card className="border-border shadow-level-1"><CardHeader><CardTitle className="text-base">Category-wise stock</CardTitle></CardHeader><CardContent><ReportTable headers={['Category', 'Products', 'Stock', 'Value']} rows={categories.map(([category, value]) => [category, value.count, value.stock, money(value.value)])} /></CardContent></Card><Card className="border-border shadow-level-1"><CardHeader><CardTitle className="text-base">Low-stock alerts <Badge variant="outline" className="ml-2">{lowStock.length}</Badge></CardTitle></CardHeader><CardContent>{lowStock.length ? <ReportTable headers={['Product', 'Available', 'Reorder level', 'Status']} rows={lowStock.slice(0, 20).map((product) => [product.name, product.stock_quantity, product.reorder_level, product.stock_quantity === 0 ? 'Out of stock' : 'Critical'])} /> : <p className="py-8 text-center text-sm text-muted-foreground">All active products are above their reorder levels.</p>}</CardContent></Card></div>; }

function ExpensesReport({ expenseTotal, expenseCount, staffCount }: { expenseTotal: number; expenseCount: number; staffCount: number }) { return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Card className="border-border shadow-level-1"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Recorded expenses</p><p className="mt-2 break-words text-2xl font-semibold">{money(expenseTotal)}</p></CardContent></Card><Card className="border-border shadow-level-1"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Expense transactions</p><p className="mt-2 text-2xl font-semibold">{expenseCount}</p></CardContent></Card><Card className="border-border shadow-level-1 sm:col-span-2 lg:col-span-1"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active staff</p><p className="mt-2 text-2xl font-semibold">{staffCount}</p></CardContent></Card></div>; }

function PendingReport({ bookings, collected, pending, collectionRate }: { bookings: ReportBooking[]; collected: number; pending: number; collectionRate: number }) { return <div className="space-y-5"><Card className="border-border shadow-level-1"><CardHeader><CardTitle className="text-base">Pending payments</CardTitle></CardHeader><CardContent>{bookings.length ? <ReportTable headers={['Order #', 'Type', 'Customer', 'Total', 'Paid', 'Pending']} rows={bookings.map((booking) => [booking.booking_number, booking.booking_type === 'rental' ? 'Rental' : 'Sale', booking.customers?.name ?? '—', money(booking.total), money(booking.paid_amount), money(booking.balance_amount)])} /> : <p className="py-10 text-center text-sm text-muted-foreground">No pending payments in this period.</p>}</CardContent></Card><div className="grid gap-3 sm:grid-cols-3">{[['Total collected', money(collected)], ['Total pending', money(pending)], ['Collection rate', `${collectionRate}%`]].map(([label, value]) => <Card key={String(label)} className="border-border shadow-level-1"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div></div>; }

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) { return <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{headers.map((header) => <th key={header} className="px-3 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-border/70 last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-muted">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`px-3 py-3 ${index === rows.length - 1 ? 'font-semibold' : ''}`}>{cell}</td>)}</tr>)}</tbody></table></div>; }
