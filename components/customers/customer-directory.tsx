'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  IndianRupee,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { friendlyDate, money, statusLabel, statusTone } from '@/lib/bookings';
import { saveCustomerAction } from '@/app/customers/actions';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import Link from 'next/link';

export type CustomerRecord = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerBooking = {
  id: number;
  booking_number: string;
  booking_type: 'sale' | 'rental';
  status: string;
  event_name: string;
  event_date: string;
  total: number;
  balance_amount: number;
  customer_id: number;
  created_at: string;
};

const inputClass =
  'mt-1.5 h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';

export function CustomerDirectory({
  initialCustomers,
  bookings,
  loadError,
  readOnly = false,
}: {
  initialCustomers: CustomerRecord[];
  bookings: CustomerBooking[];
  loadError: string;
  readOnly?: boolean;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState('');
  const [customerScope, setCustomerScope] = useState<'all' | 'returning'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<CustomerRecord | null | undefined>(
    undefined,
  );
  const [viewing, setViewing] = useState<CustomerRecord | null>(null);
  const [message, setMessage] = useState(loadError);

  const bookingsByCustomer = useMemo(() => {
    const groups = new Map<number, CustomerBooking[]>();
    for (const booking of bookings) {
      const group = groups.get(booking.customer_id);
      if (group) group.push(booking);
      else groups.set(booking.customer_id, [booking]);
    }
    return groups;
  }, [bookings]);

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesScope = customerScope === 'all'
        || (bookingsByCustomer.get(customer.id)?.length ?? 0) > 1;
      const matchesSearch = !query || [customer.name, customer.phone, customer.address, customer.email].some(
        (value) => value?.toLowerCase().includes(query),
      );
      return matchesScope && matchesSearch;
    });
  }, [bookingsByCustomer, customerScope, customers, search]);
  const customerPageCount = Math.max(
    1,
    Math.ceil(visibleCustomers.length / pageSize),
  );
  const safeCustomerPage = Math.min(page, customerPageCount);
  const pagedCustomers = visibleCustomers.slice(
    (safeCustomerPage - 1) * pageSize,
    safeCustomerPage * pageSize,
  );

  const totalBusiness = bookings.reduce(
    (sum, booking) => sum + Number(booking.total),
    0,
  );
  const totalOutstanding = bookings.reduce(
    (sum, booking) => sum + Number(booking.balance_amount),
    0,
  );
  const returningCustomers = customers.filter(
    (customer) => (bookingsByCustomer.get(customer.id)?.length ?? 0) > 1,
  ).length;

  function saved(customer: CustomerRecord) {
    setCustomers((current) =>
      current.some((row) => row.id === customer.id)
        ? current.map((row) => (row.id === customer.id ? customer : row))
        : [customer, ...current],
    );
    setEditing(undefined);
    setMessage('');
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title="Customers"
        subtitle="Customer details, booking history and outstanding balances"
        backHref="/dashboard"
        actions={!readOnly ? (
          <Button type="button" size="sm" onClick={() => setEditing(null)}>
            <Plus />
            <span className="hidden sm:inline">Add customer</span>
          </Button>
        ) : null}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<UsersRound />}
          label="Total customers"
          value={String(customers.length)}
          note="Saved in your database"
          onClick={() => { setCustomerScope('all'); setPage(1); }}
          active={customerScope === 'all'}
        />
        <Metric
          icon={<ShoppingBag />}
          label="Returning customers"
          value={String(returningCustomers)}
          note="More than one booking"
          onClick={() => { setCustomerScope('returning'); setPage(1); }}
          active={customerScope === 'returning'}
        />
        <Metric
          icon={<IndianRupee />}
          label="Total business"
          value={money(totalBusiness)}
          note="Across all bookings"
          href="/bookings"
        />
        <Metric
          icon={<WalletCards />}
          label="Outstanding"
          value={money(totalOutstanding)}
          note="Pending collection"
          href="/ledger"
        />
      </div>

      {message ? (
        <Alert variant="destructive">
          <AlertTitle>Customer data could not be updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
        <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All customers</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {visibleCustomers.length} of {customers.length} customer records
              </p>
            </div>
            <label className="relative block sm:w-80">
              <span className="sr-only">Search customers</span>
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, phone or address…"
                className={`${inputClass} mt-0 pl-9`}
              />
            </label>
          </div>
        </CardHeader>
        <ListPagination
          total={visibleCustomers.length}
          page={safeCustomerPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="customers"
        />
        <CardContent className="p-0">
          {visibleCustomers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b bg-[#f7f4ef] dark:bg-[#241e17] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Address</th>
                    <th className="px-5 py-3 font-medium">Bookings</th>
                    <th className="px-5 py-3 font-medium">Total business</th>
                    <th className="px-5 py-3 font-medium">Outstanding</th>
                    <th className="px-5 py-3 font-medium">Last booking</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCustomers.map((customer) => (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
                      bookings={bookingsByCustomer.get(customer.id) ?? []}
                      onView={() => setViewing(customer)}
                      onEdit={() => setEditing(customer)}
                      readOnly={readOnly}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-primary">
                  <UserRound />
                </span>
                <h3 className="mt-4 font-semibold">No customers found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust your search or add the first customer.
                </p>
                {!readOnly ? <Button
                  type="button"
                  className="mt-5"
                  onClick={() => setEditing(null)}
                >
                  <Plus />
                  Add customer
                </Button> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editing !== undefined ? (
        <CustomerDialog
          customer={editing}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
        />
      ) : null}
      {viewing ? (
        <CustomerDetails
          customer={viewing}
          bookings={bookingsByCustomer.get(viewing.id) ?? []}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  onClick,
  href,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  const card = (
    <Card className={`h-full gap-0 py-0 shadow-level-1 transition ring-0 ${active ? 'border-primary/45 ring-2 ring-primary/10' : 'border-border'}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-[#e4d2b6] [&_svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-[-0.03em]">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
  if (href) {
    return <Link href={href} className="min-w-0 rounded-xl transition hover:-translate-y-0.5 hover:shadow-level-2">{card}</Link>;
  }
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-w-0 rounded-xl text-left transition hover:-translate-y-0.5 hover:shadow-level-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {card}
    </button>
  ) : card;
}

function CustomerRow({
  customer,
  bookings,
  onView,
  onEdit,
  readOnly,
}: {
  customer: CustomerRecord;
  bookings: CustomerBooking[];
  onView: () => void;
  onEdit: () => void;
  readOnly: boolean;
}) {
  const total = bookings.reduce(
    (sum, booking) => sum + Number(booking.total),
    0,
  );
  const balance = bookings.reduce(
    (sum, booking) => sum + Number(booking.balance_amount),
    0,
  );
  const lastBooking = bookings[0];
  const initials = customer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <tr className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]">
      <td aria-label={`Customer ${customer.name}`} className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f5ead8] dark:bg-[#33291c] text-xs font-semibold text-[#70481c] ring-1 ring-[#e4d2b6]">
            {initials}
          </span>
          <div>
            <p className="font-semibold">{customer.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3" />
              {customer.phone}
            </p>
          </div>
        </div>
      </td>
      <td className="max-w-64 px-5 py-4 text-muted-foreground">
        <span className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-2">
            {customer.address || 'Not added'}
          </span>
        </span>
      </td>
      <td className="px-5 py-4">
        <span className="font-semibold">{bookings.length}</span>
        <span className="ml-1 text-xs text-muted-foreground">orders</span>
      </td>
      <td className="px-5 py-4 font-semibold">{money(total)}</td>
      <td
        className={`px-5 py-4 font-semibold ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
      >
        {money(balance)}
      </td>
      <td className="px-5 py-4">
        {lastBooking ? (
          <>
            <p className="font-medium">
              {friendlyDate(lastBooking.event_date)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastBooking.booking_number}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">No bookings</span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          {!readOnly ? <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            aria-label={`Edit ${customer.name}`}
          >
            <Pencil />
            Edit
          </Button> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onView}
            aria-label={`View ${customer.name} details`}
          >
            View
            <ChevronRight />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRecord | null;
  onClose: () => void;
  onSaved: (customer: CustomerRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const payload = {
      name: text('name'),
      phone: `${text('country_code')}${text('phone').replace(/^\+/, '').replace(/^\d{1,3}(?=\d{10}$)/, '')}`,
      address: text('address') || null,
      email: customer?.email ?? null,
      notes: customer?.notes ?? null,
    };
    const result = await saveCustomerAction(
      customer ? { id: customer.id, ...payload } : payload,
    );
    if (result.error || !result.data) {
      setError(result.error || 'Customer could not be saved.');
      setBusy(false);
      return;
    }
    onSaved(result.data);
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#211d18]/70 p-4 backdrop-blur-sm">
      <dialog
        open
        aria-labelledby="customer-dialog-title"
        className="relative m-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[22px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)]"
      >
        <div className="flex items-start justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-5 sm:px-6">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-[#e4d2b6]">
              <UserRound className="size-5" />
            </span>
            <div>
              <h2
                id="customer-dialog-title"
                className="text-lg font-semibold tracking-[-0.03em]"
              >
                {customer ? 'Edit customer' : 'Add new customer'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved immediately to your secure customer directory.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer popup"
            className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Customer name</span>
              <input
                name="name"
                minLength={2}
                required
                defaultValue={customer?.name ?? ''}
                className={inputClass}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Phone number</span>
              <div className="mt-1.5 flex max-w-md gap-2"><select name="country_code" defaultValue="+91" className="h-10 w-24 shrink-0 rounded-lg border border-input bg-white px-2 text-sm dark:bg-card"><option>+91</option><option>+1</option><option>+44</option><option>+61</option><option>+971</option><option>+65</option></select><input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{7,15}" maxLength={15} required defaultValue={customer?.phone?.replace(/^\+\d{1,3}/, '') ?? ''} className={`${inputClass} mt-0 min-w-0 flex-1`} /></div>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">City / address</span>
              <textarea
                name="address"
                rows={3}
                defaultValue={customer?.address ?? ''}
                placeholder="Enter the complete customer address…"
                className="mt-1.5 w-full rounded-lg border border-input bg-white dark:bg-card p-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Customer was not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Check />
              {busy ? 'Saving…' : customer ? 'Save changes' : 'Save customer'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function CustomerDetails({
  customer,
  bookings,
  onClose,
}: {
  customer: CustomerRecord;
  bookings: CustomerBooking[];
  onClose: () => void;
}) {
  const total = bookings.reduce(
    (sum, booking) => sum + Number(booking.total),
    0,
  );
  const balance = bookings.reduce(
    (sum, booking) => sum + Number(booking.balance_amount),
    0,
  );
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#211d18]/70 p-4 backdrop-blur-sm">
      <dialog
        open
        aria-labelledby="customer-details-title"
        className="relative m-0 max-h-[88dvh] w-full max-w-2xl overflow-hidden rounded-[22px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)]"
      >
        <div className="flex items-start justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Customer profile
            </p>
            <h2
              id="customer-details-title"
              className="mt-1 text-xl font-semibold tracking-[-0.03em]"
            >
              {customer.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Customer since {friendlyDate(customer.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer details"
            className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[calc(88dvh-105px)] space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric label="Bookings" value={String(bookings.length)} />
            <DetailMetric label="Total business" value={money(total)} />
            <DetailMetric label="Outstanding" value={money(balance)} />
          </div>
          <Card className="gap-0 border-border py-0 shadow-none ring-0">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
              <Detail label="Phone" value={customer.phone} />
              <Detail label="Address" value={customer.address || 'Not added'} />
              <Detail label="Email" value={customer.email || 'Not collected'} />
              <Detail label="Notes" value={customer.notes || 'No notes'} />
            </CardContent>
          </Card>
          <div>
            <h3 className="font-semibold">Booking history</h3>
            <div className="mt-3 space-y-2">
              {bookings.length ? (
                bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-col gap-3 rounded-xl border bg-white dark:bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {booking.booking_number}
                        </p>
                        <Badge
                          variant="outline"
                          className={statusTone(booking.status)}
                        >
                          {statusLabel(booking.status)}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {booking.booking_type}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{booking.event_name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" />
                        {friendlyDate(booking.event_date)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold">{money(booking.total)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Due {money(booking.balance_amount)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No bookings created for this customer yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white dark:bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
    </div>
  );
}
