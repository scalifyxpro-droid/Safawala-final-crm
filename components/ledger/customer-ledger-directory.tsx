'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  IndianRupee,
  Landmark,
  ReceiptText,
  Search,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { money } from '@/lib/bookings';
import type { LedgerBooking, LedgerCustomer } from '@/lib/ledger';
import { ledgerTotals } from '@/lib/ledger';

export function CustomerLedgerDirectory({
  customers,
  bookings,
  loadError,
}: {
  customers: LedgerCustomer[];
  bookings: LedgerBooking[];
  loadError: string;
}) {
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [type, setType] = useState<'all' | 'sale' | 'rental'>('all');
  const [balance, setBalance] = useState<'all' | 'due' | 'settled'>('all');
  const [metric, setMetric] = useState<'billing' | 'received' | 'outstanding' | 'customers'>('billing');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const bookingsByCustomer = useMemo(() => {
    const grouped = new Map<number, LedgerBooking[]>();
    for (const booking of bookings) {
      if (type !== 'all' && booking.booking_type !== type) continue;
      const existing = grouped.get(booking.customer_id);
      if (existing) existing.push(booking);
      else grouped.set(booking.customer_id, [booking]);
    }
    return grouped;
  }, [bookings, type]);

  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return customers
      .map((customer) => {
        const customerBookings = bookingsByCustomer.get(customer.id) ?? [];
        const totals = ledgerTotals(customerBookings);
        const searchable = [
          customer.name,
          customer.phone,
          customer.email,
          ...customerBookings.flatMap((booking) => [
            booking.booking_number,
            booking.event_name,
            ...booking.booking_payments.map(
              (payment) => payment.reference_number ?? '',
            ),
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return { customer, bookings: customerBookings, totals, searchable };
      })
      .filter(
        (row) =>
          row.bookings.length > 0 &&
          (!normalized || row.searchable.includes(normalized)) &&
          (balance === 'all' ||
            (balance === 'due'
              ? row.totals.outstanding > 0
              : row.totals.outstanding <= 0)) &&
          (metric === 'received'
            ? row.totals.totalPaid > 0
            : metric === 'outstanding'
              ? row.totals.outstanding > 0
              : true),
      )
      .sort((a, b) =>
        metric === 'received'
          ? b.totals.totalPaid - a.totals.totalPaid
          : metric === 'billing'
            ? b.totals.totalBilling - a.totals.totalBilling
            : metric === 'customers'
              ? a.customer.name.localeCompare(b.customer.name)
              : b.totals.outstanding - a.totals.outstanding,
      );
  }, [balance, bookingsByCustomer, customers, metric, search]);

  const allTotals = useMemo(
    () =>
      ledgerTotals(
        bookings.filter(
          (booking) => type === 'all' || booking.booking_type === type,
        ),
      ),
    [bookings, type],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const ledgerCustomerCount = useMemo(
    () =>
      customers.filter((customer) =>
        bookings.some(
          (booking) =>
            booking.customer_id === customer.id &&
            (type === 'all' || booking.booking_type === type),
        ),
      ).length,
    [bookings, customers, type],
  );
  const safePage = Math.min(page, pageCount);
  const pagedRows = rows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const resetPage = () => setPage(1);
  const selectMetric = (next: typeof metric) => {
    setMetric(next);
    setSearch('');
    setSearchDraft('');
    setType('all');
    setBalance(next === 'outstanding' ? 'due' : 'all');
    resetPage();
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title="Customer Ledger"
        subtitle="Customer-wise billing, receipts and outstanding balances"
        backHref="/dashboard"
      />

      <section className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Metric
          icon={<IndianRupee />}
          label="Total billing"
          value={money(allTotals.totalBilling)}
          note={`${allTotals.totalBills} active bills`}
          active={metric === 'billing'}
          onClick={() => selectMetric('billing')}
        />
        <Metric
          icon={<ReceiptText />}
          label="Total received"
          value={money(allTotals.totalPaid)}
          note="Across all payment entries"
          tone="success"
          active={metric === 'received'}
          onClick={() => selectMetric('received')}
        />
        <Metric
          icon={<WalletCards />}
          label="Outstanding"
          value={money(allTotals.outstanding)}
          note="Pending collection"
          tone="warning"
          active={metric === 'outstanding'}
          onClick={() => selectMetric('outstanding')}
        />
        <Metric
          icon={<UsersRound />}
          label="Ledger customers"
          value={String(ledgerCustomerCount)}
          note="Customers with bills"
          active={metric === 'customers'}
          onClick={() => selectMetric('customers')}
        />
      </section>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Customer ledger could not be loaded</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
        <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Customer accounts</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Open a customer to view the complete chronological statement.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(240px,1fr)_140px_150px]">
              <label className="relative">
                <span className="sr-only">Search customer ledger</span>
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  value={searchDraft}
                  onChange={(event) => {
                    setSearchDraft(event.target.value);
                    if (window.matchMedia('(min-width: 1280px)').matches) {
                      setSearch(event.target.value);
                      resetPage();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setSearch(searchDraft.trim());
                      if (window.matchMedia('(max-width: 1279px)').matches) {
                        setType('all');
                        setBalance('all');
                        setMetric('billing');
                      }
                      resetPage();
                    }
                  }}
                  placeholder="Customer, bill or reference…"
                  className="h-10 w-full rounded-lg border bg-white dark:bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </label>
              <button type="button" onClick={() => { setSearch(searchDraft.trim()); setType('all'); setBalance('all'); setMetric('billing'); resetPage(); }} className="h-10 rounded-lg border border-input bg-white px-5 text-sm font-medium hover:bg-accent dark:bg-card xl:hidden">Search</button>
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as typeof type);
                  setMetric('billing');
                  resetPage();
                }}
                aria-label="Booking type"
                className="hidden h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm outline-none focus:border-ring xl:block"
              >
                <option value="all">All types</option>
                <option value="sale">Sales</option>
                <option value="rental">Rentals</option>
              </select>
              <select
                value={balance}
                onChange={(event) => {
                  setBalance(event.target.value as typeof balance);
                  setMetric(
                    event.target.value === 'due' ? 'outstanding' : 'billing',
                  );
                  resetPage();
                }}
                aria-label="Balance status"
                className="hidden h-10 rounded-lg border bg-white dark:bg-card px-3 text-sm outline-none focus:border-ring xl:block"
              >
                <option value="all">All balances</option>
                <option value="due">Outstanding</option>
                <option value="settled">Settled</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <ListPagination
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            resetPage();
          }}
          itemLabel="customers"
        />
        <CardContent className="p-0">
          {pagedRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b bg-[#f7f4ef] dark:bg-[#241e17] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 text-right font-medium">Bills</th>
                    <th className="px-5 py-3 text-right font-medium">Total billing</th>
                    <th className="px-5 py-3 text-right font-medium">Received</th>
                    <th className="px-5 py-3 text-right font-medium">Outstanding</th>
                    <th className="px-5 py-3 text-right font-medium">Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map(({ customer, totals }) => (
                    <tr key={customer.id} className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]">
                      <td className="px-5 py-4">
                        <Link href={`/ledger/${customer.id}`} className="font-semibold text-primary hover:underline">
                          {customer.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">{customer.phone}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-medium">{totals.totalBills}</td>
                      <td className="px-5 py-4 text-right font-semibold">{money(totals.totalBilling)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-emerald-700">{money(totals.totalPaid)}</td>
                      <td className={`px-5 py-4 text-right font-semibold ${totals.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {money(totals.outstanding)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" size="sm" render={<Link href={`/ledger/${customer.id}`} />}>
                          View ledger <ArrowRight />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                  <Landmark />
                </span>
                <h3 className="mt-4 font-semibold">No customer accounts found</h3>
                <p className="mt-1 text-sm text-muted-foreground">Adjust the search or ledger filters.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  tone = 'default',
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'success' | 'warning';
  active: boolean;
  onClick: () => void;
}) {
  const iconTone =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-accent text-primary ring-[#e4d2b6]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Show ${label.toLowerCase()} accounts`}
      className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Card className={`h-full gap-0 py-0 shadow-level-1 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-level-2 ${active ? 'border-primary/50 ring-2 ring-primary/10' : 'border-border ring-0'}`}>
        <CardContent className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold tracking-[-0.03em]">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 [&_svg]:size-4 ${iconTone}`}>{icon}</span>
          <span className="sr-only">Show {label.toLowerCase()} accounts</span>
        </CardContent>
      </Card>
    </button>
  );
}
