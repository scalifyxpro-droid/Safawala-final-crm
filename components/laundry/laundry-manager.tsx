'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CalendarDays,
  Eye,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  addLaundryNoteAction,
  createLaundryBatchAction,
  updateLaundryBatchAction,
  updateLaundryStatusAction,
} from '@/app/laundry/actions';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Vendor = {
  id: number;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
};
type Product = {
  id: number;
  name: string;
  category?: string | null;
  stock_quantity?: number | null;
};
type Item = {
  id?: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
  condition_before: string;
  condition_after?: string | null;
  unit_cost: number;
  notes?: string | null;
};
export type LaundryBatch = {
  id: number;
  batch_number: string;
  vendor_id: number;
  status: 'in_progress' | 'returned' | 'cancelled';
  sent_date: string;
  expected_return_date: string;
  total_cost: number;
  notes?: string | null;
  vendors?: Vendor | null;
  laundry_batch_items?: Item[];
  laundry_batch_notes?: { id: number; note: string; created_at: string }[];
};
const input =
  'h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';
const area =
  'w-full rounded-lg border border-input bg-white dark:bg-card p-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';

export function LaundryManager({
  initialBatches,
  vendors,
  products,
  loadError,
}: {
  initialBatches: LaundryBatch[];
  vendors: Vendor[];
  products: Product[];
  loadError?: string;
}) {
  const router = useRouter();
  const [batches, setBatches] = useState(initialBatches);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [status, setStatus] = useState('all');
  const [modal, setModal] = useState<'create' | 'edit' | 'view' | null>(null);
  const [selected, setSelected] = useState<LaundryBatch | null>(null);
  const [error, setError] = useState(loadError ?? '');
  const [busy, setBusy] = useState(false);
  const active = batches.filter((batch) => batch.status === 'in_progress');
  const filtered = useMemo(
    () =>
      batches.filter(
        (batch) =>
          (status === 'all' || batch.status === status) &&
          `${batch.batch_number} ${batch.vendors?.name ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [batches, search, status],
  );
  const totalItems = batches.reduce(
    (sum, batch) =>
      sum +
      (batch.laundry_batch_items ?? []).reduce(
        (itemSum, item) => itemSum + item.quantity,
        0,
      ),
    0,
  );
  const totalCost = batches.reduce(
    (sum, batch) => sum + Number(batch.total_cost || 0),
    0,
  );
  function openCreate() {
    setSelected(null);
    setError('');
    setModal('create');
  }
  function openEdit(batch: LaundryBatch) {
    setSelected(batch);
    setError('');
    setModal('edit');
  }
  async function changeStatus(
    batch: LaundryBatch,
    next: 'returned' | 'cancelled',
  ) {
    if (!window.confirm(`Mark ${batch.batch_number} as ${next}?`)) return;
    setBusy(true);
    try {
      await updateLaundryStatusAction(batch.id, next);
      setBatches((list) =>
        list.map((item) =>
          item.id === batch.id ? { ...item, status: next } : item,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update batch.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title="Laundry Management"
        subtitle="Manage laundry batches and vendor relationships"
        backHref="/dashboard"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus /> Create Batch
          </Button>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Laundry could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="responsive-kpi-grid grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Total batches"
          value={batches.length}
          note="All laundry batches"
          icon={<Archive />}
        />
        <Stat
          label="In progress"
          value={active.length}
          note="Currently being processed"
          icon={<RefreshCw />}
        />
        <Stat
          label="Total items"
          value={totalItems}
          note="Items in all batches"
          icon={<PackageCheck />}
        />
        <Stat
          label="Total cost"
          value={`₹${totalCost.toFixed(2)}`}
          note="Total laundry costs"
          icon={<CalendarDays />}
        />
      </div>
      <Card className="border-border shadow-level-1">
        <CardHeader className="flex flex-col gap-4 border-b bg-[#fffdf9] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg">Laundry Batches</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Track and manage all laundry batches sent to vendors
            </p>
          </div>
          <div className="grid w-full gap-2 xl:w-auto xl:min-w-[430px] xl:grid-cols-[minmax(240px,1fr)_170px]">
            <form className="grid min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft); if (window.matchMedia('(max-width: 1279px)').matches) setStatus('all'); }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search batches"
                placeholder="Search batches..."
                value={searchDraft}
                onChange={(e) => { setSearchDraft(e.target.value); if (window.matchMedia('(min-width: 1280px)').matches) setSearch(e.target.value); }}
                className={`${input} pl-9`}
              />
            </div>
            <Button type="submit" variant="outline" className="xl:hidden">Search</Button>
            </form>
            <select
              aria-label="Filter status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${input} hidden xl:block`}
            >
              <option value="all">All Statuses</option>
              <option value="in_progress">In Progress</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b bg-[#faf8f4] dark:bg-[#241e17] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  'Batch Number',
                  'Vendor',
                  'Status',
                  'Items',
                  'Cost',
                  'Sent Date',
                  'Expected Return',
                  'Actions',
                ].map((label) => (
                  <th key={label} className="px-5 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((batch) => (
                <tr
                  key={batch.id}
                  className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                >
                  <td className="px-5 py-4 font-semibold">
                    {batch.batch_number}
                  </td>
                  <td className="px-5 py-4">
                    {batch.vendors?.name ?? 'Unknown vendor'}
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      variant="outline"
                      className={
                        batch.status === 'in_progress'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : batch.status === 'returned'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }
                    >
                      {batch.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    {(batch.laundry_batch_items ?? []).reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    )}{' '}
                    items
                  </td>
                  <td className="px-5 py-4">
                    ₹{Number(batch.total_cost || 0).toFixed(2)}
                  </td>
                  <td className="px-5 py-4">{batch.sent_date}</td>
                  <td className="px-5 py-4">{batch.expected_return_date}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelected(batch);
                          setModal('view');
                        }}
                      >
                        {' '}
                        <Eye />{' '}
                      </Button>
                      {batch.status === 'in_progress' ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(batch)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => changeStatus(batch, 'returned')}
                          >
                            Mark Returned
                          </Button>
                        </>
                      ) : null}
                      {batch.status !== 'cancelled' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() => changeStatus(batch, 'cancelled')}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No laundry batches match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {modal === 'create' ? (
        <BatchModal
          title="Create New Laundry Batch"
          vendors={vendors}
          products={products}
          error={error}
          busy={busy}
          close={() => setModal(null)}
          submit={async (form) => {
            setBusy(true);
            try {
              await createLaundryBatchAction(form);
              setModal(null);
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Unable to create batch.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {modal === 'edit' && selected ? (
        <BatchModal
          title={`Edit Batch - ${selected.batch_number}`}
          batch={selected}
          vendors={vendors}
          products={products}
          error={error}
          busy={busy}
          close={() => setModal(null)}
          submit={async (form) => {
            setBusy(true);
            try {
              await updateLaundryBatchAction(form);
              setModal(null);
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Unable to update batch.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {modal === 'view' && selected ? (
        <Details
          batch={selected}
          close={() => setModal(null)}
          onNote={async (note) => {
            await addLaundryNoteAction(selected.id, note);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border shadow-level-1">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

function BatchModal({
  title,
  batch,
  vendors,
  products,
  error,
  busy,
  close,
  submit,
}: {
  title: string;
  batch?: LaundryBatch;
  vendors: Vendor[];
  products: Product[];
  error: string;
  busy: boolean;
  close: () => void;
  submit: (form: FormData) => Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>(batch?.laundry_batch_items ?? []);
  const [productId, setProductId] = useState('');
  const [other, setOther] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState('dirty');
  const [cost, setCost] = useState(0);
  const [itemNote, setItemNote] = useState('');
  function addItem() {
    const product = products.find((item) => String(item.id) === productId);
    const name = product?.name ?? other.trim();
    if (!name) return;
    setItems((list) => [
      ...list,
      {
        product_id: product?.id ?? null,
        product_name: name,
        quantity: Math.max(1, quantity),
        condition_before: condition,
        unit_cost: Math.max(0, cost),
        notes: itemNote || null,
      },
    ]);
    setProductId('');
    setOther('');
    setQuantity(1);
    setCost(0);
    setItemNote('');
  }
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('items_json', JSON.stringify(items));
    await submit(form);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#211d18]/60 p-4">
      <Card className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto border-border shadow-2xl">
        <CardHeader className="flex-row items-start justify-between border-b px-5 py-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {batch
                ? 'Modify batch items and update details'
                : 'Create a new batch to send items to a laundry vendor'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label="Close"
          >
            <X />
          </Button>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-5 p-5">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Vendor</span>
                <select
                  name="vendor_id"
                  required
                  defaultValue={String(batch?.vendor_id ?? '')}
                  className={input}
                >
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Sent Date</span>
                <input
                  name="sent_date"
                  type="date"
                  required
                  defaultValue={batch?.sent_date ?? ''}
                  className={input}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">
                  Expected Return Date
                </span>
                <input
                  name="expected_return_date"
                  type="date"
                  required
                  defaultValue={batch?.expected_return_date ?? ''}
                  className={input}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1.5 block font-medium">Notes</span>
                <textarea
                  name="notes"
                  defaultValue={batch?.notes ?? ''}
                  placeholder="General notes about this batch..."
                  className={area}
                  rows={2}
                />
              </label>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h3 className="font-semibold">Add Items to Batch</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm lg:col-span-2">
                  <span className="mb-1.5 block">Product</span>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className={input}
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {product.category ? ` · ${product.category}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  aria-label="Use a custom product name"
                  className="flex items-end gap-2 text-sm lg:col-span-2"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(other)}
                    onChange={(e) => {
                      if (!e.target.checked) setOther('');
                      else setProductId('');
                    }}
                    className="mb-3 size-4 accent-[#9a6728]"
                  />
                  <span className="w-full">
                    <span className="mb-1.5 block">Other Product</span>
                    <input
                      value={other}
                      onChange={(e) => setOther(e.target.value)}
                      placeholder="Custom item name"
                      className={input}
                    />
                  </span>
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block">Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className={input}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block">Condition Before</span>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className={input}
                  >
                    <option value="dirty">Dirty</option>
                    <option value="stained">Stained</option>
                    <option value="damaged">Damaged</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block">
                    Laundry Charge (₹) - Total
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(Number(e.target.value))}
                    className={input}
                  />
                </label>
                <label className="text-sm lg:col-span-1">
                  <span className="mb-1.5 block">Item Notes</span>
                  <input
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    placeholder="Notes..."
                    className={input}
                  />
                </label>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={addItem}
              >
                <Plus /> Add Item
              </Button>
              {items.length ? (
                <div className="mt-4 divide-y rounded-lg border">
                  {items.map((item, index) => (
                    <div
                      key={`${item.product_name}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                    >
                      <span>
                        <strong>{item.product_name}</strong>
                        <span className="ml-2 text-muted-foreground">
                          × {item.quantity} · {item.condition_before}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        ₹{(item.unit_cost * item.quantity).toFixed(2)}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setItems((list) =>
                              list.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          aria-label="Remove item"
                        >
                          <X />
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No items added yet.
                </p>
              )}
            </div>
          </CardContent>
          <div className="flex justify-end gap-2 border-t p-5">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : batch ? 'Save Changes' : 'Create Batch'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Details({
  batch,
  close,
  onNote,
}: {
  batch: LaundryBatch;
  close: () => void;
  onNote: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function saveNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await onNote(note);
      setNote('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#211d18]/60 p-4">
      <Card className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto border-border shadow-2xl">
        <CardHeader className="flex-row items-start justify-between border-b px-5 py-4">
          <div>
            <CardTitle>Batch Details - {batch.batch_number}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Detailed information about this laundry batch
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label="Close"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Vendor" value={batch.vendors?.name ?? '—'} />
            <Detail label="Status" value={batch.status.replace('_', ' ')} />
            <Detail label="Sent Date" value={batch.sent_date} />
            <Detail
              label="Expected Return"
              value={batch.expected_return_date}
            />
            <Detail
              label="Total Items"
              value={String(
                (batch.laundry_batch_items ?? []).reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                ),
              )}
            />
            <Detail
              label="Total Cost"
              value={`₹${Number(batch.total_cost || 0).toFixed(2)}`}
            />
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Batch Items</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-[#faf8f4] dark:bg-[#241e17]">
                  <tr>
                    {[
                      'Product',
                      'Quantity',
                      'Condition Before',
                      'Condition After',
                      'Unit Cost',
                      'Total Cost',
                    ].map((label) => (
                      <th key={label} className="px-3 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(batch.laundry_batch_items ?? []).map((item) => (
                    <tr key={item.id ?? item.product_name} className="border-t">
                      <td className="px-3 py-2">{item.product_name}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{item.condition_before}</td>
                      <td className="px-3 py-2">
                        {item.condition_after ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        ₹{Number(item.unit_cost).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        ₹{(Number(item.unit_cost) * item.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Add Note</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this batch..."
              className={area}
              rows={3}
            />
            <Button onClick={saveNote} disabled={busy || !note.trim()}>
              {busy ? 'Saving…' : 'Add Note'}
            </Button>
          </div>
        </CardContent>
        <div className="flex justify-end border-t p-5">
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium capitalize">{value}</p>
    </div>
  );
}
