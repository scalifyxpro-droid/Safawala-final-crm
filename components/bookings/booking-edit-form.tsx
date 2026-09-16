'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Box,
  Camera,
  Check,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { BarcodeScannerModal } from '@/components/bookings/barcode-scanner-modal';
import { TimeField } from '@/components/bookings/booking-form';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { displayQuoteNumber, money, statusLabel } from '@/lib/bookings';
import { useHardwareScannerListener } from '@/lib/hooks/use-hardware-scanner';
import {
  updateBookingDetailsAction,
  updateBookingFieldsAction,
} from '@/app/bookings/actions';
import { validateCouponAction } from '@/app/coupons/actions';

type BookingItem = {
  id?: number;
  product_id: number | null;
  package_id: number | null;
  package_variant_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  security_deposit: number;
};
type Booking = {
  id: number;
  booking_number: string;
  booking_type: 'sale' | 'rental';
  status: string;
  is_quote: boolean;
  customer_id: number;
  assigned_staff_id: number | null;
  event_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string | null;
  contact_name: string | null;
  alternate_mobile: string | null;
  pickup_date: string | null;
  due_date: string | null;
  notes: string | null;
  discount: number;
  tax: number;
  paid_amount: number;
  booking_items: BookingItem[];
};
type Customer = { id: number; name: string; phone: string };
type Staff = { id: number; name: string };
type Product = {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  sale_price: number;
  rental_price: number;
  security_deposit: number;
  stock_quantity: number;
};
type PackageRow = {
  id: number;
  name: string;
  sale_price: number;
  rental_price: number;
  security_deposit: number;
};
type Item = {
  key: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  security_deposit: number;
  product_id?: number;
  package_id?: number;
  package_variant_id?: number;
};

const fieldClass =
  'mt-1.5 h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20';
const uid = () => Math.random().toString(36).slice(2);

export function BookingEditForm({
  booking,
  customers,
  staff,
  products,
  packages,
}: {
  booking: Booking;
  customers: Customer[];
  staff: Staff[];
  products: Product[];
  packages: PackageRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isSale = booking.booking_type === 'sale';
  const editableItems = booking.paid_amount === 0;
  const isQuote = booking.is_quote && booking.status === 'draft';
  const backHref = isQuote ? '/quotes' : `/bookings/${booking.id}`;
  const documentNumber = booking.is_quote
    ? displayQuoteNumber(booking.booking_number, booking.booking_type)
    : booking.booking_number;

  const [pickupDate, setPickupDate] = useState(booking.pickup_date ?? '');
  const [dueDate, setDueDate] = useState(booking.due_date ?? '');
  const [availabilityByProduct, setAvailabilityByProduct] = useState<
    Record<number, { totalStock: number; reserved: number; available: number }>
  >({});

  // Refresh how many units of each product are free for the chosen rental
  // window, counting every OTHER rental booking's overlapping reservation
  // (this booking's own items are excluded so editing it doesn't self-block).
  useEffect(() => {
    if (
      isSale ||
      !editableItems ||
      !pickupDate ||
      !dueDate ||
      products.length === 0
    ) {
      setAvailabilityByProduct({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/product-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupDate,
            dueDate,
            productIds: products.map((product) => product.id),
            excludeBookingId: booking.id,
          }),
        });
        const data = await response.json();
        if (!cancelled && data?.availability) {
          setAvailabilityByProduct(data.availability);
        }
      } catch {
        // Best-effort: quantity caps fall back to flat stock if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSale, editableItems, pickupDate, dueDate, products, booking.id]);

  function getAvailableQuantity(product: Product): number {
    if (!isSale && pickupDate && dueDate) {
      const info = availabilityByProduct[product.id];
      if (info) return info.available;
    }
    return product.stock_quantity || 999;
  }

  function availabilityLabel(product: Product): string {
    if (!isSale && pickupDate && dueDate) {
      const info = availabilityByProduct[product.id];
      if (info)
        return `Available: ${info.available} / ${info.totalStock} in stock`;
    }
    return `${product.stock_quantity} in stock`;
  }

  async function warnIfOverCapacity(
    product: Product,
    requestedQuantity: number,
    available: number,
  ) {
    if (requestedQuantity <= available) return;
    const isRentalWindow = !isSale && Boolean(pickupDate && dueDate);
    setNotice(
      isRentalWindow
        ? `Only ${available} of "${product.name}" are free from ${pickupDate} to ${dueDate}. Using the maximum available instead.`
        : `Only ${available} of "${product.name}" are in stock. Using the maximum available instead.`,
    );
    if (!isRentalWindow) return;
    try {
      const response = await fetch('/api/product-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupDate,
          dueDate,
          productIds: [product.id],
          excludeBookingId: booking.id,
          checkQuantity: { productId: product.id, quantity: requestedQuantity },
        }),
      });
      const data = await response.json();
      if (data?.nextAvailable) {
        setNotice(
          `Only ${available} of "${product.name}" are free from ${pickupDate} to ${dueDate}. ${requestedQuantity} will next be fully available from ${data.nextAvailable.pickupDate} to ${data.nextAvailable.dueDate}.`,
        );
      } else if (data && data.nextAvailable === null) {
        setNotice(
          `Only ${available} of "${product.name}" are free from ${pickupDate} to ${dueDate}, and ${requestedQuantity} won't become available in the next 60 days either.`,
        );
      }
    } catch {
      // Best-effort — the clamp notice above already covers the essentials.
    }
  }

  const [items, setItems] = useState<Item[]>(() =>
    booking.booking_items.map((row) => ({
      key: uid(),
      item_name: row.item_name,
      quantity: row.quantity,
      unit_price: Number(row.unit_price),
      security_deposit: Number(row.security_deposit),
      product_id: row.product_id ?? undefined,
      package_id: row.package_id ?? undefined,
      package_variant_id: row.package_variant_id ?? undefined,
    })),
  );
  const [discount, setDiscount] = useState(Number(booking.discount) || 0);
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(Number(booking.tax) > 0);
  const [productSearch, setProductSearch] = useState('');

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
    [items],
  );
  const deposit = useMemo(
    () =>
      isSale ? 0 : items.reduce((sum, item) => sum + item.security_deposit, 0),
    [items, isSale],
  );
  const taxable = Math.max(subtotal - discount, 0);
  async function applyCoupon() {
    if (!couponCode.trim()) return setCouponMessage('Enter a coupon code.');
    setCouponBusy(true);
    setCouponMessage('');
    try {
      const result = await validateCouponAction(couponCode, subtotal);
      setDiscount(result.discount);
      setAppliedCoupon(result.code);
      setCouponMessage(`${result.code} applied: ${money(result.discount)} off`);
    } catch (error) {
      setAppliedCoupon('');
      setCouponMessage(
        error instanceof Error ? error.message : 'Unable to apply coupon.',
      );
    } finally {
      setCouponBusy(false);
    }
  }
  const tax = taxEnabled ? Math.round(taxable * 0.05) : 0;
  const total = taxable + tax + deposit;
  const visibleProducts = products.filter((product) =>
    `${product.name} ${product.barcode ?? ''} ${product.sku ?? ''}`
      .toLowerCase()
      .includes(productSearch.toLowerCase()),
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  const [productMessage, setProductMessage] = useState('');

  async function handleBarcodeSubmit(rawValue: string) {
    const scanned = rawValue.trim().toLowerCase();
    if (!scanned) return;
    let match = products.find(
      (item) =>
        item.barcode?.trim().toLowerCase() === scanned ||
        item.sku?.trim().toLowerCase() === scanned,
    );
    if (!match) {
      try {
        const response = await fetch('/api/barcode/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode: rawValue.trim() }),
        });
        if (response.ok) match = (await response.json()).product as Product;
      } catch {
        // Fall through to the existing not-found message.
      }
    }
    if (match) {
      addProduct(match);
      setProductSearch('');
      setProductMessage('');
      return;
    }
    setProductMessage(`No product matches barcode "${rawValue}".`);
  }

  // A physical USB/Bluetooth barcode scanner "types" the code and an Enter
  // key anywhere on the page — this catches that even when the product
  // search box isn't the focused field.
  useHardwareScannerListener(handleBarcodeSubmit, editableItems);

  function handleProductSearchChange(value: string) {
    setProductSearch(value);
    const scanned = value.trim().toLowerCase();
    if (!scanned) {
      setProductMessage('');
      return;
    }
    const exact = products.find(
      (item) =>
        item.barcode?.trim().toLowerCase() === scanned ||
        item.sku?.trim().toLowerCase() === scanned,
    );
    if (exact) {
      addProduct(exact);
      setProductSearch('');
      setProductMessage('');
    }
  }

  function updateItem(key: string, patch: Partial<Item>) {
    if (patch.quantity !== undefined) {
      const current = items.find((row) => row.key === key);
      const product = current?.product_id
        ? products.find((row) => row.id === current.product_id)
        : undefined;
      if (product) {
        const stockLimit = getAvailableQuantity(product);
        const requested = Math.max(1, Math.floor(patch.quantity));
        if (requested > stockLimit) {
          void warnIfOverCapacity(product, requested, stockLimit);
        }
      }
    }
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        if (patch.quantity === undefined || !item.product_id) {
          return { ...item, ...patch };
        }
        const product = products.find((row) => row.id === item.product_id);
        const stockLimit = product ? getAvailableQuantity(product) : 999;
        return {
          ...item,
          ...patch,
          quantity: Math.min(
            stockLimit,
            Math.max(1, Math.floor(patch.quantity)),
          ),
        };
      }),
    );
  }
  function addProduct(product: Product) {
    const maxQuantity = getAvailableQuantity(product);
    const existingItem = items.find((item) => item.product_id === product.id);
    const totalWanted = (existingItem?.quantity ?? 0) + 1;
    if (totalWanted > maxQuantity) {
      void warnIfOverCapacity(product, totalWanted, maxQuantity);
    } else {
      setNotice('');
    }
    setItems((current) => {
      const existing = current.find((item) => item.product_id === product.id);
      if (existing)
        return current.map((item) =>
          item.key === existing.key
            ? { ...item, quantity: Math.min(maxQuantity, item.quantity + 1) }
            : item,
        );
      return [
        ...current,
        {
          key: uid(),
          product_id: product.id,
          item_name: product.name,
          quantity: Math.min(maxQuantity, 1),
          unit_price: Number(
            isSale ? product.sale_price : product.rental_price,
          ),
          security_deposit: isSale ? 0 : Number(product.security_deposit),
        },
      ];
    });
  }
  function addPackage(pack: PackageRow) {
    setItems((current) => [
      ...current,
      {
        key: uid(),
        package_id: pack.id,
        item_name: pack.name,
        quantity: 1,
        unit_price: Number(isSale ? pack.sale_price : pack.rental_price),
        security_deposit: isSale ? 0 : Number(pack.security_deposit),
      },
    ]);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };

    if (editableItems) {
      if (
        items.length === 0 ||
        items.some(
          (item) => item.item_name.trim().length < 2 || item.quantity < 1,
        )
      ) {
        setError('Add at least one valid item before saving.');
        setBusy(false);
        return;
      }
      const payload = {
        customer_id: Number(form.get('customer_id')),
        assigned_staff_id: text('assigned_staff_id'),
        event_name: text('event_name'),
        event_date: text('event_date'),
        event_time: text('event_time'),
        event_location: text('event_location'),
        contact_name:
          booking.booking_type === 'rental' ? text('contact_name') : '',
        alternate_mobile:
          booking.booking_type === 'rental' ? text('alternate_mobile') : '',
        pickup_date:
          booking.booking_type === 'rental' ? text('pickup_date') : '',
        due_date: booking.booking_type === 'rental' ? text('due_date') : '',
        notes: text('notes'),
        items: items.map(({ key: _key, ...item }) => item),
        discount,
        tax,
      };
      const { error: rpcErrorMessage } = await updateBookingDetailsAction(
        booking.id,
        payload,
      );
      if (rpcErrorMessage) {
        setError(rpcErrorMessage);
        setBusy(false);
        return;
      }
    } else {
      const { error: updateErrorMessage } = await updateBookingFieldsAction(
        booking.id,
        {
          customer_id: Number(form.get('customer_id')),
          assigned_staff_id: text('assigned_staff_id')
            ? Number(form.get('assigned_staff_id'))
            : null,
          event_name: text('event_name'),
          event_date: text('event_date'),
          event_time: text('event_time') || null,
          event_location: text('event_location') || null,
          contact_name:
            booking.booking_type === 'rental'
              ? text('contact_name') || null
              : null,
          alternate_mobile:
            booking.booking_type === 'rental'
              ? text('alternate_mobile') || null
              : null,
          pickup_date:
            booking.booking_type === 'rental'
              ? text('pickup_date') || null
              : null,
          due_date:
            booking.booking_type === 'rental' ? text('due_date') || null : null,
          notes: text('notes') || null,
        },
      );
      if (updateErrorMessage) {
        setError(updateErrorMessage);
        setBusy(false);
        return;
      }
    }
    router.push(
      isQuote ? `/quotes?updated=${documentNumber}` : `/bookings/${booking.id}`,
    );
  }

  return (
    <div className="mx-auto max-w-[1160px] space-y-6">
      <DashboardHeader
        title={`Edit ${documentNumber}`}
        subtitle="Update customer, delivery and operational booking details"
        backHref={backHref}
      />
      <form onSubmit={submit} className="space-y-5">
        <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
          <CardHeader className="flex-row items-center justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary">
                <Pencil className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base">Booking information</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {editableItems
                    ? 'No payment recorded yet — items and pricing are fully editable.'
                    : 'Financial totals and recorded payments remain protected.'}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="capitalize">
              {statusLabel(booking.booking_type)}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Customer" required>
              <select
                name="customer_id"
                required
                defaultValue={String(booking.customer_id)}
                className={fieldClass}
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned staff">
              <select
                name="assigned_staff_id"
                defaultValue={booking.assigned_staff_id ?? ''}
                className={fieldClass}
              >
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
            <Input
              label="Occasion / order title"
              name="event_name"
              defaultValue={booking.event_name}
              required
            />
            <Input
              label={
                booking.booking_type === 'sale' ? 'Delivery date' : 'Event date'
              }
              name="event_date"
              type="date"
              defaultValue={booking.event_date}
              required
            />
            <TimeField
              label="Delivery time"
              name="event_time"
              defaultValue={booking.event_time?.slice(0, 5)}
            />
            <Input
              label="Delivery location"
              name="event_location"
              defaultValue={booking.event_location ?? ''}
            />
            {booking.booking_type === 'rental' ? (
              <>
                <Input
                  label="Contact name"
                  name="contact_name"
                  defaultValue={booking.contact_name ?? ''}
                  required
                />
                <Input
                  label="Alternate mobile number"
                  name="alternate_mobile"
                  type="tel"
                  defaultValue={booking.alternate_mobile ?? ''}
                  required
                  pattern="[0-9]{10}"
                  maxLength={10}
                />
                <Field label="Pickup date" required>
                  <input
                    name="pickup_date"
                    type="date"
                    value={pickupDate}
                    onChange={(event) => setPickupDate(event.target.value)}
                    className={fieldClass}
                    required
                  />
                </Field>
                <Field label="Return due date" required>
                  <input
                    name="due_date"
                    type="date"
                    value={dueDate}
                    min={pickupDate || undefined}
                    onChange={(event) => setDueDate(event.target.value)}
                    className={fieldClass}
                    required
                  />
                </Field>
              </>
            ) : null}
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Booking notes</span>
              <textarea
                name="notes"
                rows={6}
                defaultValue={booking.notes ?? ''}
                className="mt-1.5 w-full rounded-lg border border-input bg-white dark:bg-card p-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </CardContent>
        </Card>

        {editableItems ? (
          <>
            <Card className="gap-0 border-border py-0 shadow-none ring-0">
              <CardHeader className="flex-row items-center justify-between border-b px-4 py-4">
                <div className="flex items-center gap-2">
                  <Box className="size-4" />
                  <CardTitle className="text-sm font-semibold">
                    Products & packages
                  </CardTitle>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems((current) => [
                      ...current,
                      {
                        key: uid(),
                        item_name: '',
                        quantity: 1,
                        unit_price: 0,
                        security_deposit: 0,
                      },
                    ])
                  }
                >
                  <Plus />
                  Quick custom product
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <input
                    value={productSearch}
                    onChange={(e) => handleProductSearchChange(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      void handleBarcodeSubmit(productSearch);
                    }}
                    placeholder="Search product, barcode or SKU…"
                    className={`${fieldClass} !mt-0 pl-9 pr-20`}
                  />
                  <div className="absolute right-2 top-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Add product by barcode"
                      title="Add"
                      onClick={() => void handleBarcodeSubmit(productSearch)}
                      className="grid size-7 place-items-center rounded-md text-primary hover:bg-muted"
                    >
                      <Plus className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Scan barcode with camera"
                      onClick={() => setCameraOpen(true)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                      <Camera className="size-4" />
                    </button>
                  </div>
                </div>
                {productMessage ? (
                  <p className="text-sm text-destructive">{productMessage}</p>
                ) : null}
                {visibleProducts.length ? (
                  <div className="grid max-h-[280px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-white dark:bg-card p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-level-1"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {product.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {availabilityLabel(product)}
                          </span>
                        </span>
                        <strong className="shrink-0 text-sm text-foreground">
                          {money(
                            isSale ? product.sale_price : product.rental_price,
                          )}
                        </strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
                    No matching products.
                  </p>
                )}
                {packages.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Packages
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {packages.map((pack) => (
                        <Button
                          key={pack.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addPackage(pack)}
                        >
                          <Plus />
                          {pack.name} ·{' '}
                          {money(isSale ? pack.sale_price : pack.rental_price)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="gap-0 border-border py-0 shadow-none ring-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="border-b bg-[#f5f2ed] dark:bg-[#241e17] text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Qty</th>
                        <th className="px-4 py-3 font-medium">Rate</th>
                        {!isSale && (
                          <th className="px-4 py-3 font-medium">Deposit</th>
                        )}
                        <th className="px-4 py-3 text-right font-medium">
                          Total
                        </th>
                        <th className="w-12">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length ? (
                        items.map((item) => (
                          <tr key={item.key} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              <input
                                value={item.item_name}
                                onChange={(e) =>
                                  updateItem(item.key, {
                                    item_name: e.target.value,
                                    product_id: undefined,
                                    package_id: undefined,
                                    package_variant_id: undefined,
                                  })
                                }
                                aria-label="Item name"
                                className={`${fieldClass} !mt-0`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="1"
                                max={
                                  item.product_id
                                    ? (() => {
                                        const product = products.find(
                                          (row) => row.id === item.product_id,
                                        );
                                        return product
                                          ? getAvailableQuantity(product) ||
                                              undefined
                                          : undefined;
                                      })()
                                    : undefined
                                }
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItem(item.key, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                                aria-label="Quantity"
                                className={`${fieldClass} !mt-0 w-20`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.unit_price}
                                onChange={(e) =>
                                  updateItem(item.key, {
                                    unit_price: Number(e.target.value),
                                  })
                                }
                                aria-label="Rate"
                                className={`${fieldClass} !mt-0 w-28`}
                              />
                            </td>
                            {!isSale && (
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.security_deposit}
                                  onChange={(e) =>
                                    updateItem(item.key, {
                                      security_deposit: Number(e.target.value),
                                    })
                                  }
                                  aria-label="Security deposit"
                                  className={`${fieldClass} !mt-0 w-28`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-right font-semibold">
                              {money(item.quantity * item.unit_price)}
                            </td>
                            <td className="px-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setItems((current) =>
                                    current.filter(
                                      (row) => row.key !== item.key,
                                    ),
                                  )
                                }
                                aria-label={`Remove ${item.item_name || 'item'}`}
                              >
                                <Trash2 />
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={isSale ? 5 : 6}
                            className="px-4 py-9 text-center"
                          >
                            <Box className="mx-auto size-5 text-muted-foreground/50" />
                            <p className="mt-2 text-sm text-muted-foreground">
                              No items added yet
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="gap-0 border-border py-0 shadow-none ring-0">
                <CardHeader className="border-b px-4 py-4">
                  <CardTitle className="text-sm font-semibold">
                    Discounts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-muted-foreground">
                      Discount amount
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className={`${fieldClass} !mt-0`}
                    />
                  </label>
                  <div className="border-t pt-3">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-muted-foreground">
                        Coupon code
                      </span>
                      <div className="flex gap-2">
                        <input
                          value={couponCode}
                          onChange={(event) =>
                            setCouponCode(event.target.value.toUpperCase())
                          }
                          placeholder="e.g. SAVE10"
                          className={`${fieldClass} min-w-0 flex-1 !mt-0`}
                          disabled={couponBusy}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={applyCoupon}
                          disabled={couponBusy || !couponCode.trim()}
                        >
                          {couponBusy ? 'Checking…' : 'Apply'}
                        </Button>
                      </div>
                    </label>
                    {couponMessage ? (
                      <p
                        className={`mt-1.5 text-xs ${appliedCoupon ? 'text-emerald-700' : 'text-destructive'}`}
                      >
                        {couponMessage}
                      </p>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={taxEnabled}
                      onChange={(e) => setTaxEnabled(e.target.checked)}
                      className="size-4 accent-[#9a6728]"
                    />
                    Apply GST (5%)
                  </label>
                </CardContent>
              </Card>
              <Card className="min-w-0 gap-0 overflow-hidden border-[#dfc9a6] py-0 shadow-none ring-0">
                <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-3 py-3 sm:px-4 sm:py-4">
                  <CardTitle className="text-sm font-semibold">
                    Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-3 text-sm sm:p-4">
                  <Amount label="Subtotal" value={subtotal} />
                  <Amount label="Discount" value={-discount} />
                  {taxEnabled && <Amount label="GST (5%)" value={tax} />}
                  {!isSale && (
                    <Amount label="Security deposit" value={deposit} />
                  )}
                  <div className="border-t pt-3">
                    <Amount label="Total amount" value={total} strong />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Alert className="border-[#e4d2b6] bg-[#fcfaf7] dark:bg-[#241e17] text-[#6e471f]">
            <ShieldCheck className="size-4" />
            <AlertTitle>Items and totals are locked</AlertTitle>
            <AlertDescription>
              A payment has already been recorded against this booking, so
              products, pricing and totals can no longer be changed here.
            </AlertDescription>
          </Alert>
        )}

        {notice ? (
          <Alert className="border-[#e4d2b6] bg-[#fcfaf7] dark:bg-[#241e17] text-[#6e471f]">
            <ShieldCheck className="size-4" />
            <AlertTitle>Not enough stock for these dates</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Booking was not updated</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 rounded-xl border bg-white dark:bg-card p-4 shadow-level-1">
          <Button
            type="button"
            variant="outline"
            render={<Link href={backHref} />}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Check />
            {busy ? 'Saving changes…' : 'Save changes'}
          </Button>
        </div>
      </form>
      <BarcodeScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={(value) => {
          setCameraOpen(false);
          void handleBarcodeSubmit(value);
        }}
      />
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Input({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  pattern,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label} required={required}>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
        className={fieldClass}
      />
    </Field>
  );
}

function Amount({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className={`min-w-0 leading-5 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`shrink-0 text-right tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>
        {money(value)}
      </span>
    </div>
  );
}
