'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  createCouponAction,
  deleteCouponAction,
  toggleCouponAction,
  updateCouponAction,
} from '@/app/coupons/actions';

export type CouponOffer = {
  id: number;
  code: string;
  name: string;
  discount_type: 'percentage' | 'fixed';
  value: number;
  is_active: boolean;
  created_at: string;
};

const BLANK_OFFER: CouponOffer = {
  id: 0,
  code: '',
  name: '',
  discount_type: 'percentage',
  value: 0,
  is_active: true,
  created_at: '',
};

export function CouponsManager({
  offers,
  loadError = '',
}: {
  offers: CouponOffer[];
  loadError?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CouponOffer | null>(null);
  const [listError, setListError] = useState(loadError);
  const [modalError, setModalError] = useState('');
  const active = offers.filter((offer) => offer.is_active).length;

  function openCreate() {
    setModalError('');
    setEditing(BLANK_OFFER);
  }
  function openEdit(offer: CouponOffer) {
    setModalError('');
    setEditing(offer);
  }

  async function submit(form: FormData) {
    try {
      // `editing` is always a truthy object here (a blank placeholder for a
      // new offer, or the real row for an edit) — so the create/update
      // branch must check editing.id, not just whether editing is set.
      // Checking `editing` alone previously sent every new offer through
      // updateCouponAction with id=0, which matches zero rows, reports no
      // error, and silently inserts nothing — the coupon never shows up.
      if (editing && editing.id) {
        await updateCouponAction(form);
      } else {
        await createCouponAction(form);
      }
      setEditing(null);
      setModalError('');
      router.refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Unable to save offer.');
    }
  }

  async function toggle(offer: CouponOffer) {
    try {
      const form = new FormData();
      form.set('id', String(offer.id));
      form.set('is_active', String(!offer.is_active));
      await toggleCouponAction(form);
      setListError('');
      router.refresh();
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Unable to update offer.');
    }
  }

  async function remove(id: number) {
    if (!window.confirm('Delete this offer permanently?')) return;
    try {
      const form = new FormData();
      form.set('id', String(id));
      await deleteCouponAction(form);
      setListError('');
      router.refresh();
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Unable to delete offer.');
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <DashboardHeader
        title="Manage Offers"
        subtitle="Create, edit, and manage discount codes for bookings"
        backHref="/dashboard"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Offer
          </Button>
        }
      />
      {listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="border-border shadow-level-1">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">All Offers</h2>
              <p className="text-sm text-muted-foreground">
                {offers.length} total · {active} active
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Tag className="size-5 text-primary" />
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> New Offer
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                  {offer.discount_type === 'percentage' ? '%' : '₹'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    <code className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                      {offer.code}
                    </code>
                    {offer.discount_type === 'percentage'
                      ? `${offer.value}% off`
                      : `₹${offer.value} off`}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {offer.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(offer)}
                  aria-label={`${offer.is_active ? 'Deactivate' : 'Activate'} ${offer.code}`}
                  className={`relative h-7 w-12 rounded-full transition ${offer.is_active ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span
                    className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${offer.is_active ? 'left-6' : 'left-1'}`}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(offer)}
                  aria-label={`Edit ${offer.code}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(offer.id)}
                  aria-label={`Delete ${offer.code}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!offers.length ? (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No offers yet. Create your first discount code.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {editing ? (
        <OfferModal
          offer={editing.id ? editing : null}
          error={modalError}
          close={() => setEditing(null)}
          submit={submit}
        />
      ) : null}
    </div>
  );
}

function OfferModal({
  offer,
  error,
  close,
  submit,
}: {
  offer: CouponOffer | null;
  error: string;
  close: () => void;
  submit: (form: FormData) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Card className="w-full max-w-2xl border-border shadow-level-3">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Tag className="size-5 text-primary" />
                <h2 className="text-xl font-semibold">
                  {offer ? 'Edit Offer' : 'New Offer'}
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Customers can redeem this offer during booking.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
          {/* Shown inside the modal itself — this overlay covers the whole
              screen, so an error rendered outside it (as it was before)
              is invisible to the user while the modal stays open. */}
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <form action={submit} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={offer?.id ?? ''} />
            <label className="text-sm font-medium">
              Code *
              <input
                name="code"
                required
                defaultValue={offer?.code}
                placeholder="e.g., SAVE10"
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 uppercase"
              />
            </label>
            <label className="text-sm font-medium">
              Name *
              <input
                name="name"
                required
                defaultValue={offer?.name}
                placeholder="e.g., Summer Sale"
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Type *
              <select
                name="discount_type"
                defaultValue={offer?.discount_type ?? 'percentage'}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Value *
              <input
                name="value"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={offer?.value || ''}
                placeholder="0"
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3"
              />
            </label>
            <label
              aria-label="Coupon availability"
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm sm:col-span-2"
            >
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={offer?.is_active ?? true}
                className="size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">Active</span>
                <span className="text-muted-foreground">
                  Customers can redeem this offer immediately
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">
                <Check className="size-4" />{' '}
                {offer ? 'Save Changes' : 'Create Offer'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
