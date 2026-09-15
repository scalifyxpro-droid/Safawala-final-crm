'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Check,
  ChevronRight,
  FolderPlus,
  Layers3,
  PackageOpen,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import {
  createPackageCategoryAction,
  deletePackageCategoryAction,
  deletePackageVariantAction,
  savePackageVariantAction,
} from '@/app/packages/actions';

export type PackageVariant = {
  id: number;
  category_id: number;
  safa_quantity: number | null;
  package_number: number | null;
  name: string;
  description: string | null;
  base_price: number;
  inclusions: string[];
  extra_safa_price: number;
  missing_safa_penalty: number;
  security_deposit: number;
  created_at: string;
  updated_at: string;
};

export type PackageCategory = {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  package_variants: PackageVariant[];
};

const fieldClass =
  'mt-1.5 h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';

const currency = (value: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function variantCountLabel(count: number) {
  return `${count} ${count === 1 ? 'variant' : 'variants'}`;
}

function variantDisplayName(variant: PackageVariant) {
  if (!variant.package_number) return variant.name;
  return variant.name.replace(/^Package\s+\d+\s*:\s*/i, '');
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function PackageManagement({
  initialCategories,
  loadError,
}: {
  initialCategories: PackageCategory[];
  loadError: string;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialCategories[0]?.id ?? null,
  );
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<PackageVariant | null>(
    null,
  );
  const [deletingVariant, setDeletingVariant] = useState<PackageVariant | null>(
    null,
  );
  const [deletingCategory, setDeletingCategory] =
    useState<PackageCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loadError);
  const [notice, setNotice] = useState('');

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );
  const selectedCategory =
    activeCategories.find((category) => category.id === selectedId) ??
    activeCategories[0] ??
    null;

  function flash(message: string) {
    setError('');
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  }

  function openCreateVariant() {
    if (!selectedCategory) return;
    setError('');
    setEditingVariant(null);
    setVariantDialogOpen(true);
  }

  function openEditVariant(variant: PackageVariant) {
    setError('');
    setEditingVariant(variant);
    setVariantDialogOpen(true);
  }

  async function createCategory(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const name = formText(form, 'name').trim();
    if (!name) {
      setError('Category name is required.');
      return;
    }
    if (
      categories.some(
        (category) => category.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError('This category already exists.');
      return;
    }

    setBusy(true);
    setError('');
    const result = await createPackageCategoryAction(name);
    if (result.error || !result.data) {
      setError(
        result.error || 'The category could not be created. Please try again.',
      );
      setBusy(false);
      return;
    }

    const created: PackageCategory = {
      ...result.data,
      package_variants: [],
    };
    setCategories((current) => [...current, created]);
    setSelectedId(created.id);
    setCategoryDialogOpen(false);
    setBusy(false);
    flash('Category created successfully.');
  }

  async function saveVariant(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedCategory) return;
    const form = new FormData(event.currentTarget);
    const name = formText(form, 'name').trim();
    const description = formText(form, 'description').trim();
    const readOptionalInteger = (key: string) => {
      const value = formText(form, key).trim();
      return value ? Number(value) : null;
    };
    const safaQuantity = readOptionalInteger('safa_quantity');
    const packageNumber = readOptionalInteger('package_number');
    const readPrice = (key: string) => Number(form.get(key) ?? 0);
    const basePrice = readPrice('base_price');
    const extraSafaPrice = readPrice('extra_safa_price');
    const missingSafaPenalty = readPrice('missing_safa_penalty');
    const securityDeposit = readPrice('security_deposit');
    const prices = [
      basePrice,
      extraSafaPrice,
      missingSafaPenalty,
      securityDeposit,
    ];
    const inclusions = formText(form, 'inclusions')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!name) {
      setError('Variant name is required.');
      return;
    }
    if (
      [safaQuantity, packageNumber].some(
        (value) => value !== null && (!Number.isInteger(value) || value <= 0),
      )
    ) {
      setError(
        'Safa quantity and package number must be positive whole numbers.',
      );
      return;
    }
    if (prices.some((price) => !Number.isFinite(price) || price < 0)) {
      setError('Prices must be valid numbers and cannot be negative.');
      return;
    }

    setBusy(true);
    setError('');

    const result = await savePackageVariantAction({
      id: editingVariant?.id,
      categoryId: selectedCategory.id,
      safaQuantity,
      packageNumber,
      name,
      description,
      basePrice,
      inclusions,
      extraSafaPrice,
      missingSafaPenalty,
      securityDeposit,
    });

    if (result.error || !result.data) {
      setError(
        result.error || 'The variant could not be saved. Please try again.',
      );
      setBusy(false);
      return;
    }

    const saved = result.data;
    setCategories((current) =>
      current.map((category) =>
        category.id === selectedCategory.id
          ? {
              ...category,
              package_variants: editingVariant
                ? category.package_variants.map((variant) =>
                    variant.id === saved.id ? saved : variant,
                  )
                : [...category.package_variants, saved],
            }
          : category,
      ),
    );
    setVariantDialogOpen(false);
    setEditingVariant(null);
    setBusy(false);
    flash(
      editingVariant
        ? 'Variant updated successfully.'
        : 'Variant created successfully.',
    );
  }

  async function deleteVariant() {
    if (!deletingVariant || busy) return;
    setBusy(true);
    setError('');
    const result = await deletePackageVariantAction(deletingVariant.id);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setCategories((current) =>
      current.map((category) => ({
        ...category,
        package_variants: category.package_variants.filter(
          (variant) => variant.id !== deletingVariant.id,
        ),
      })),
    );
    setDeletingVariant(null);
    setBusy(false);
    flash('Variant deleted successfully.');
  }

  async function deleteCategory() {
    if (!deletingCategory || busy) return;
    setBusy(true);
    setError('');
    const result = await deletePackageCategoryAction(deletingCategory.id);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }

    const nextCategory = categories.find(
      (category) => category.is_active && category.id !== deletingCategory.id,
    );
    setCategories((current) =>
      current.map((category) =>
        category.id === deletingCategory.id
          ? { ...category, is_active: false }
          : category,
      ),
    );
    setSelectedId(nextCategory?.id ?? null);
    setDeletingCategory(null);
    setBusy(false);
    flash('Category removed from active packages.');
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <DashboardHeader
        title="Package Manager"
        subtitle="Packages and variants in your inventory catalogue"
        backHref="/inventory"
        actions={
          <Button
            size="sm"
            variant="outline"
            render={<Link href="/inventory" />}
          >
            <Boxes /> Products
          </Button>
        }
      />

      {error &&
      !categoryDialogOpen &&
      !variantDialogOpen &&
      !deletingVariant &&
      !deletingCategory ? (
        <Alert variant="destructive">
          <AlertTitle>Package management needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <Check />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
          <div className="flex items-center justify-between border-b px-4 py-4">
            <div>
              <h3 className="font-semibold">Safa Categories</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeCategories.length} categories active
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setError('');
                setCategoryDialogOpen(true);
              }}
            >
              <Plus /> Add
            </Button>
          </div>
          <CardContent className="space-y-2 p-3">
            {activeCategories.length === 0 ? (
              <div className="grid min-h-44 place-items-center rounded-lg border border-dashed bg-[#fcfaf7] dark:bg-[#241e17] px-4 text-center">
                <div>
                  <PackageOpen className="mx-auto size-7 text-primary/70" />
                  <p className="mt-2 text-sm font-medium">
                    No categories found.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add the first category to begin.
                  </p>
                </div>
              </div>
            ) : (
              activeCategories.map((category) => {
                const selected = category.id === selectedCategory?.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedId(category.id)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-[#d9bd91] bg-accent shadow-sm' : 'border-border bg-white dark:bg-card hover:border-[#d9bd91] hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]'}`}
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-lg ${selected ? 'bg-primary text-white' : 'bg-[#f5ead8] dark:bg-[#33291c] text-primary'}`}
                    >
                      <PackageOpen className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">
                        {category.name}
                      </strong>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {variantCountLabel(category.package_variants.length)}
                      </span>
                    </span>
                    <ChevronRight
                      className={`size-4 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground/60'}`}
                    />
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {selectedCategory ? (
            <>
              <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-primary">
                      ACTIVE CATEGORY
                    </p>
                    <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.02em]">
                      {selectedCategory.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {variantCountLabel(
                        selectedCategory.package_variants.length,
                      )}{' '}
                      configured
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setError('');
                        setDeletingCategory(selectedCategory);
                      }}
                    >
                      <Trash2 /> Remove category
                    </Button>
                    <Button type="button" onClick={openCreateVariant}>
                      <Plus /> Add Variant
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {selectedCategory.package_variants.length === 0 ? (
                <Card className="border-dashed border-[#d9c8b0] py-0 shadow-none ring-0">
                  <CardContent className="grid min-h-72 place-items-center p-6 text-center">
                    <div>
                      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-primary">
                        <Layers3 className="size-6" />
                      </span>
                      <h3 className="mt-4 font-semibold">
                        No variants configured.
                      </h3>
                      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                        Add the first variant for {selectedCategory.name}.
                      </p>
                      <Button
                        type="button"
                        className="mt-4"
                        onClick={openCreateVariant}
                      >
                        <Plus /> Add Variant
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {selectedCategory.package_variants.map((variant) => (
                    <VariantCard
                      key={variant.id}
                      variant={variant}
                      onEdit={() => openEditVariant(variant)}
                      onDelete={() => {
                        setError('');
                        setDeletingVariant(variant);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card className="border-dashed py-0 shadow-none ring-0">
              <CardContent className="grid min-h-[390px] place-items-center p-6 text-center">
                <div>
                  <PackageOpen className="mx-auto size-9 text-primary/70" />
                  <h3 className="mt-3 font-semibold">No active category</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create a category to start managing variants.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {categoryDialogOpen ? (
        <CategoryDialog
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setCategoryDialogOpen(false);
          }}
          onSubmit={createCategory}
        />
      ) : null}
      {variantDialogOpen && selectedCategory ? (
        <VariantDialog
          categoryName={selectedCategory.name}
          variant={editingVariant}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setVariantDialogOpen(false);
              setEditingVariant(null);
            }
          }}
          onSubmit={saveVariant}
        />
      ) : null}
      {deletingVariant ? (
        <DeleteVariantDialog
          variant={deletingVariant}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setDeletingVariant(null);
          }}
          onConfirm={deleteVariant}
        />
      ) : null}
      {deletingCategory ? (
        <DeleteCategoryDialog
          category={deletingCategory}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setDeletingCategory(null);
          }}
          onConfirm={deleteCategory}
        />
      ) : null}
    </div>
  );
}

function VariantCard({
  variant,
  onEdit,
  onDelete,
}: {
  variant: PackageVariant;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">
                {variantDisplayName(variant)}
              </h3>
              {variant.package_number ? (
                <Badge
                  variant="outline"
                  className="bg-white dark:bg-card font-normal"
                >
                  Package {variant.package_number}
                </Badge>
              ) : null}
            </div>
            {variant.description ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {variant.description}
              </p>
            ) : null}
          </div>
          <Badge className="shrink-0 bg-accent px-2.5 py-1 text-sm font-semibold text-primary">
            {currency(variant.base_price)}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border bg-[#fcfaf7] dark:bg-[#241e17] p-3 text-xs">
          {variant.safa_quantity ? (
            <div className="col-span-2 border-b pb-2">
              <PriceDetail
                label="Package quantity"
                value={`${variant.safa_quantity} Safas`}
              />
            </div>
          ) : null}
          <PriceDetail
            label="Extra Safa"
            value={currency(variant.extra_safa_price)}
          />
          <PriceDetail
            label="Security Dep."
            value={currency(variant.security_deposit)}
          />
          <div className="col-span-2 border-t pt-2">
            <PriceDetail
              label="Missing Safa Penalty"
              value={currency(variant.missing_safa_penalty)}
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.13em] text-primary">
            <Sparkles className="size-3.5" /> INCLUSIONS
          </p>
          <div className="mt-2 flex min-h-7 flex-wrap gap-1.5">
            {variant.inclusions.length ? (
              variant.inclusions.map((inclusion) => (
                <Badge
                  key={inclusion}
                  variant="outline"
                  className="bg-white dark:bg-card font-normal"
                >
                  {inclusion}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                No inclusions added.
              </span>
            )}
          </div>
        </div>
      </CardContent>
      <div className="flex gap-2 border-t bg-[#fcfaf7] dark:bg-[#241e17] p-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onEdit}
        >
          <Pencil /> Edit
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="flex-1"
          onClick={onDelete}
        >
          <Trash2 /> Delete
        </Button>
      </div>
    </Card>
  );
}

function PriceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <strong className="font-semibold tabular-nums">{value}</strong>
    </div>
  );
}

function DialogFrame({
  title,
  icon,
  children,
  onClose,
  maxWidth = 'max-w-lg',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#211d18]/70 p-4 backdrop-blur-sm">
      <dialog
        open
        aria-modal="true"
        aria-labelledby="package-dialog-title"
        className={`relative m-auto w-full ${maxWidth} overflow-hidden rounded-2xl border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)]`}
      >
        <div className="flex items-center justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary ring-1 ring-[#e4d2b6] [&_svg]:size-5">
              {icon}
            </span>
            <h2
              id="package-dialog-title"
              className="text-lg font-semibold tracking-[-0.03em]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}

function CategoryDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogFrame
      title="Create New Category"
      icon={<FolderPlus />}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
        <label className="block text-sm">
          <span className="font-medium">Category Name</span>
          <input
            name="name"
            required
            placeholder="e.g., 21 Safas"
            className={fieldClass}
          />
        </label>
        {error ? (
          <FormError title="Category was not created" text={error} />
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          <Plus /> {busy ? 'Creating…' : 'Create Category'}
        </Button>
      </form>
    </DialogFrame>
  );
}

function VariantDialog({
  categoryName,
  variant,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  categoryName: string;
  variant: PackageVariant | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogFrame
      title={variant ? 'Edit Variant' : 'Create New Variant'}
      icon={<Layers3 />}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
        <div className="rounded-lg border border-[#e4d2b6] bg-accent px-3 py-2 text-sm">
          <span className="text-muted-foreground">Category:</span>{' '}
          <strong>{categoryName}</strong>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Variant Name</span>
          <input
            name="name"
            required
            defaultValue={variant?.name ?? ''}
            placeholder="E.g. Premium Collection"
            className={fieldClass}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Safa Quantity</span>
            <input
              name="safa_quantity"
              type="number"
              min="1"
              step="1"
              defaultValue={variant?.safa_quantity ?? ''}
              placeholder="E.g. 21"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Package Number</span>
            <input
              name="package_number"
              type="number"
              min="1"
              step="1"
              defaultValue={variant?.package_number ?? ''}
              placeholder="E.g. 1"
              className={fieldClass}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Description</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={variant?.description ?? ''}
            placeholder="Optional short description"
            className="mt-1.5 w-full rounded-lg border border-input bg-white dark:bg-card px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Base Price (₹)</span>
          <input
            name="base_price"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={variant?.base_price ?? '0.00'}
            className={fieldClass}
          />
          <span className="mt-1.5 block text-xs text-muted-foreground">
            This is the base price for the variant.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Included products / items</span>
          <textarea
            name="inclusions"
            rows={3}
            defaultValue={variant?.inclusions.join(', ') ?? ''}
            placeholder="E.g. Safa, Kalgi, Necklace, Earrings"
            className="mt-1.5 w-full rounded-lg border border-input bg-white dark:bg-card px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Add every product or item included in this package, separated by
            commas.
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <PriceInput
            name="extra_safa_price"
            label="Extra Safa Price (₹)"
            value={variant?.extra_safa_price}
          />
          <PriceInput
            name="missing_safa_penalty"
            label="Missing Safa Penalty (₹)"
            value={variant?.missing_safa_penalty}
          />
        </div>
        <PriceInput
          name="security_deposit"
          label="Security Deposit (₹)"
          value={variant?.security_deposit}
        />
        {error ? (
          <FormError title="Variant was not saved" text={error} />
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
            {busy ? 'Saving…' : variant ? 'Save Changes' : 'Create Variant'}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

function PriceInput({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type="number"
        min="0"
        step="0.01"
        required
        defaultValue={value ?? '0.00'}
        className={fieldClass}
      />
    </label>
  );
}

function DeleteVariantDialog({
  variant,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  variant: PackageVariant;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFrame title="Delete Variant?" icon={<Trash2 />} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <strong className="text-foreground">“{variant.name}”</strong>?
        </p>
        {error ? (
          <FormError title="Variant was not deleted" text={error} />
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
          >
            <Trash2 /> {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function DeleteCategoryDialog({
  category,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  category: PackageCategory;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFrame title="Remove Category?" icon={<Trash2 />} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Remove <strong className="text-foreground">“{category.name}”</strong>{' '}
          and its {variantCountLabel(category.package_variants.length)} from
          active package and booking screens? Existing booking history will
          remain safe.
        </p>
        {error ? (
          <FormError title="Category was not removed" text={error} />
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
          >
            <Trash2 /> {busy ? 'Removing…' : 'Remove category'}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function FormError({ title, text }: { title: string; text: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
