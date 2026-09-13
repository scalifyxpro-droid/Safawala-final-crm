'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  UserCheck,
  UserX,
  Eye,
  X,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import {
  createVendorAction,
  deleteVendorAction,
  toggleVendorStatusAction,
  updateVendorAction,
} from '@/app/vendors/actions';

export type Vendor = {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

const inputClass =
  'mt-1.5 h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';
const areaClass =
  'mt-1.5 min-h-20 w-full rounded-lg border border-input bg-white dark:bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'V'
  );
}

export function VendorManager({
  vendors,
  loadError = '',
}: {
  vendors: Vendor[];
  loadError?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState<'create' | 'edit' | 'view' | null>(null);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [listError, setListError] = useState(loadError);
  const [modalError, setModalError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const total = vendors.length;
  const activeCount = vendors.filter((vendor) => vendor.is_active).length;
  const inactiveCount = total - activeCount;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vendors.filter((vendor) => {
      const matchesQuery =
        !query ||
        [vendor.name, vendor.contact_person, vendor.phone, vendor.email].some(
          (value) => value?.toLowerCase().includes(query),
        );
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? vendor.is_active : !vendor.is_active);
      return matchesQuery && matchesStatus;
    });
  }, [vendors, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function openCreate() {
    setModalError('');
    setSelected(null);
    setModal('create');
  }
  function openEdit(vendor: Vendor) {
    setModalError('');
    setSelected(vendor);
    setModal('edit');
  }
  function openView(vendor: Vendor) {
    setSelected(vendor);
    setModal('view');
  }
  function closeModal() {
    setModal(null);
    setSelected(null);
    setModalError('');
  }

  async function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 500);
  }

  async function submit(form: FormData) {
    try {
      if (modal === 'edit' && selected) {
        form.set('id', String(selected.id));
        await updateVendorAction(form);
      } else {
        await createVendorAction(form);
      }
      closeModal();
      setListError('');
      router.refresh();
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : 'Unable to save vendor.',
      );
    }
  }

  async function toggleStatus(vendor: Vendor) {
    try {
      const form = new FormData();
      form.set('id', String(vendor.id));
      form.set('is_active', String(!vendor.is_active));
      await toggleVendorStatusAction(form);
      setListError('');
      router.refresh();
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : 'Unable to update vendor status.',
      );
    }
  }

  async function remove(vendor: Vendor) {
    if (!window.confirm(`Delete ${vendor.name} permanently?`)) return;
    try {
      const form = new FormData();
      form.set('id', String(vendor.id));
      await deleteVendorAction(form);
      setListError('');
      router.refresh();
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : 'Unable to delete vendor.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title="Vendor Management"
        subtitle="Suppliers, contacts and vendor records for your business"
        backHref="/dashboard"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add Vendor</span>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          icon={<Truck />}
          label="Total Vendors"
          value={String(total)}
          note="Saved securely"
        />
        <Metric
          icon={<UserCheck />}
          label="Active Vendors"
          value={String(activeCount)}
          note="Currently supplying"
        />
        <Metric
          icon={<UserX />}
          label="Inactive Vendors"
          value={String(inactiveCount)}
          note="Not currently active"
        />
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
        <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All vendors</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtered.length} of {total} vendor records
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search vendors</span>
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name, contact, phone…"
                  className={`${inputClass} mt-0 pl-9`}
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(
                    event.target.value as 'all' | 'active' | 'inactive',
                  );
                  setPage(1);
                }}
                className="h-10 rounded-lg border border-input bg-white px-3 text-sm dark:bg-card"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <ListPagination
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="vendors"
        />
        <CardContent className="p-0">
          {paged.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b bg-[#f7f4ef] dark:bg-[#241e17] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Vendor</th>
                    <th className="px-5 py-3 font-medium">Contact</th>
                    <th className="px-5 py-3 font-medium">Address</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((vendor) => (
                    <tr
                      key={vendor.id}
                      className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]"
                    >
                      <td aria-label={`Vendor ${vendor.name}`} className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f5ead8] dark:bg-[#33291c] text-xs font-semibold text-[#70481c] ring-1 ring-[#e4d2b6]">
                            {initialsOf(vendor.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {vendor.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {vendor.contact_person || 'No contact person'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <Phone className="size-3" />
                          {vendor.phone}
                        </p>
                        {vendor.email ? (
                          <p className="mt-1 flex items-center gap-1.5">
                            <Mail className="size-3" />
                            {vendor.email}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-56 px-5 py-4 text-muted-foreground">
                        <span className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          <span className="line-clamp-2">
                            {vendor.address || 'Not added'}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => toggleStatus(vendor)}
                          aria-label={`${vendor.is_active ? 'Deactivate' : 'Activate'} ${vendor.name}`}
                          className="inline-flex"
                        >
                          <Badge
                            variant="outline"
                            className={
                              vendor.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                            }
                          >
                            {vendor.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openView(vendor)}
                            aria-label={`View ${vendor.name}`}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(vendor)}
                            aria-label={`Edit ${vendor.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(vendor)}
                            aria-label={`Delete ${vendor.name}`}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
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
                  <Building2 />
                </span>
                <h3 className="mt-4 font-semibold">No vendors found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust your search or add the first vendor.
                </p>
                <Button type="button" className="mt-5" onClick={openCreate}>
                  <Plus className="size-4" />
                  Add Vendor
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {modal === 'create' || modal === 'edit' ? (
        <VendorFormModal
          vendor={modal === 'edit' ? selected : null}
          error={modalError}
          close={closeModal}
          submit={submit}
        />
      ) : null}
      {modal === 'view' && selected ? (
        <VendorViewModal vendor={selected} close={closeModal} />
      ) : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
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
}

function VendorFormModal({
  vendor,
  error,
  close,
  submit,
}: {
  vendor: Vendor | null;
  error: string;
  close: () => void;
  submit: (form: FormData) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-border shadow-level-3">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="size-5 text-primary" />
                <h2 className="text-xl font-semibold">
                  {vendor ? 'Edit Vendor' : 'Add New Vendor'}
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Saved directly to your vendor directory.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <form action={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Vendor Name *
              <input
                name="name"
                required
                defaultValue={vendor?.name}
                placeholder="e.g., Royal Silks Traders"
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Contact Person
              <input
                name="contact_person"
                defaultValue={vendor?.contact_person ?? ''}
                placeholder="e.g., Rakesh Shah"
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Phone *
              <input
                name="phone"
                required
                pattern="[0-9]{10}"
                maxLength={10}
                inputMode="numeric"
                defaultValue={vendor?.phone}
                placeholder="10-digit mobile number"
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                defaultValue={vendor?.email ?? ''}
                placeholder="vendor@example.com"
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Address
              <textarea
                name="address"
                defaultValue={vendor?.address ?? ''}
                placeholder="Shop / warehouse address"
                className={areaClass}
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Notes
              <textarea
                name="notes"
                defaultValue={vendor?.notes ?? ''}
                placeholder="Payment terms, specialty items, anything worth remembering"
                className={areaClass}
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">
                {vendor ? 'Save Changes' : 'Create Vendor'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function VendorViewModal({
  vendor,
  close,
}: {
  vendor: Vendor;
  close: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-border shadow-level-3">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f5ead8] dark:bg-[#33291c] text-sm font-semibold text-[#70481c] ring-1 ring-[#e4d2b6]">
                {initialsOf(vendor.name)}
              </span>
              <div>
                <h2 className="text-lg font-semibold">{vendor.name}</h2>
                <Badge
                  variant="outline"
                  className={
                    vendor.is_active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }
                >
                  {vendor.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
          <dl className="space-y-3 text-sm">
            <Detail
              label="Contact person"
              value={vendor.contact_person || '—'}
            />
            <Detail label="Phone" value={vendor.phone} />
            <Detail label="Email" value={vendor.email || '—'} />
            <Detail label="Address" value={vendor.address || '—'} />
            <Detail label="Notes" value={vendor.notes || '—'} />
          </dl>
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{value}</dd>
    </div>
  );
}
