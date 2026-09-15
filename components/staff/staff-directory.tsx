'use client';

import { useMemo, useState, useTransition, type ReactNode, type SyntheticEvent } from 'react';
import {
  CalendarCheck2,
  Check,
  KeyRound,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserRound,
  UsersRound,
  UserX,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListPagination } from '@/components/ui/list-pagination';
import { friendlyDate } from '@/lib/bookings';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { ACCESS_MODULES, ACCESS_MODULE_META, ACCOUNTS_PORTAL_MODULES, MANAGER_PORTAL_MODULES, type AccessModule } from '@/lib/staff-portal/access-modules';
import { DEPARTMENT_META, STAFF_DEPARTMENTS, type StaffDepartment } from '@/lib/staff-portal/constants';
import type { StaffAccessType, StaffPortalKind, StaffType } from '@/lib/staff-portal/types';
import {
  createStaffLoginAction,
  resetStaffLoginPasswordAction,
  saveStaffMemberAction,
  setStaffDepartmentAction,
  setStaffLoginActiveAction,
  setStaffModuleAction,
  setStaffPortalKindAction,
  setStaffTypeAction,
  toggleStaffStatusAction,
} from '@/app/staff/actions';

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export type StaffMember = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  login_id: string | null;
  portal_active: boolean | null;
  access_type: StaffAccessType | null;
  staff_type: StaffType | null;
  portal_kind: StaffPortalKind | null;
  staff_departments: { department: StaffDepartment }[] | null;
  staff_access_modules: { module: AccessModule; enabled: boolean }[] | null;
};

type StatusFilter = 'all' | 'active' | 'inactive';

const fieldClass =
  'mt-1.5 h-10 w-full rounded-lg border border-input bg-white dark:bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20';

function departmentsOf(member: StaffMember): StaffDepartment[] {
  return (member.staff_departments ?? []).map((row) => row.department);
}

function modulesOf(member: StaffMember): AccessModule[] {
  return (member.staff_access_modules ?? []).filter((row) => row.enabled).map((row) => row.module);
}

export function StaffDirectory({
  initialStaff,
  assignmentCounts,
  loadError,
}: {
  initialStaff: StaffMember[];
  assignmentCounts: Record<string, number>;
  loadError: string;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<StaffMember | null | undefined>(
    undefined,
  );
  const [accessFor, setAccessFor] = useState<StaffMember | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState(loadError);

  const visibleStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesSearch =
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.phone?.toLowerCase().includes(query);
      const matchesStatus =
        status === 'all' ||
        (status === 'active' ? member.is_active : !member.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [search, staff, status]);
  const staffPageCount = Math.max(1, Math.ceil(visibleStaff.length / pageSize));
  const safeStaffPage = Math.min(page, staffPageCount);
  const pagedStaff = visibleStaff.slice(
    (safeStaffPage - 1) * pageSize,
    safeStaffPage * pageSize,
  );

  const activeCount = staff.filter((member) => member.is_active).length;
  const assignedCount = Object.values(assignmentCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const loginCount = staff.filter((member) => member.user_id).length;

  async function toggleStatus(member: StaffMember) {
    setBusyId(member.id);
    setMessage('');
    const { data, error } = await toggleStaffStatusAction(member.id, !member.is_active);
    if (error || !data) setMessage(error || 'Status could not be updated.');
    else
      setStaff((current) =>
        current.map((row) =>
          row.id === member.id ? { ...row, ...data } : row,
        ),
      );
    setBusyId(null);
  }

  function saved(member: StaffMember) {
    setStaff((current) => {
      const exists = current.some((row) => row.id === member.id);
      return exists
        ? current.map((row) => (row.id === member.id ? { ...row, ...member } : row))
        : [member, ...current];
    });
    setEditing(undefined);
    setMessage('');
  }

  function patchMember(id: number, patch: Partial<StaffMember>) {
    setStaff((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setAccessFor((current) => (current && current.id === id ? { ...current, ...patch } : current));
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <DashboardHeader
        title="Staff"
        subtitle="Team directory, department access and portal logins in one place"
        backHref="/dashboard"
        actions={
          <Button type="button" size="sm" onClick={() => setEditing(null)}>
            <Plus />
            <span className="hidden sm:inline">Add staff member</span>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric
          icon={<UsersRound />}
          label="Total staff"
          value={staff.length}
          note="All team members"
        />
        <Metric
          icon={<UserCheck />}
          label="Active staff"
          value={activeCount}
          note={`${staff.length - activeCount} inactive`}
        />
        <Metric
          icon={<KeyRound />}
          label="Portal logins"
          value={loginCount}
          note={`${staff.length - loginCount} without a login`}
        />
        <Metric
          icon={<CalendarCheck2 />}
          label="Upcoming assignments"
          value={assignedCount}
          note="Across future bookings"
        />
      </div>

      {message ? (
        <Alert variant="destructive">
          <AlertTitle>Staff data could not be updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-hidden border-border py-0 shadow-level-1 ring-0">
        <CardHeader className="border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>All staff</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {visibleStaff.length} of {staff.length} team members
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-72">
                <span className="sr-only">Search staff</span>
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name or phone…"
                  className={`${fieldClass} mt-0 pl-9`}
                />
              </label>
              <label>
                <span className="sr-only">Filter staff status</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as StatusFilter);
                    setPage(1);
                  }}
                  className={`${fieldClass} mt-0 sm:w-36`}
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
          </div>
        </CardHeader>
        <ListPagination
          total={visibleStaff.length}
          page={safeStaffPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="staff members"
        />
        <CardContent className="p-0">
          {visibleStaff.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1020px] text-left text-sm">
                <thead className="border-b bg-[#f7f4ef] dark:bg-[#241e17] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Staff member</th>
                    <th className="px-5 py-3 font-medium">Contact</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Upcoming work</th>
                    <th className="px-5 py-3 font-medium">Added</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStaff.map((member) => (
                    <StaffRow
                      key={member.id}
                      member={member}
                      assignments={assignmentCounts[String(member.id)] ?? 0}
                      busy={busyId === member.id}
                      onEdit={() => setEditing(member)}
                      onToggle={() => toggleStatus(member)}
                      onManageAccess={() => setAccessFor(member)}
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
                <h3 className="mt-4 font-semibold">No staff members found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust your search or add a new member to the team.
                </p>
                <Button
                  type="button"
                  className="mt-5"
                  onClick={() => setEditing(null)}
                >
                  <Plus />
                  Add staff member
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {editing !== undefined ? (
        <StaffDialog
          member={editing}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
        />
      ) : null}
      {accessFor ? (
        <AccessDialog
          member={accessFor}
          onClose={() => setAccessFor(null)}
          onPatch={(patch) => patchMember(accessFor.id, patch)}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <Card className="gap-0 border-border py-0 shadow-level-1 ring-0">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-[#e4d2b6] [&_svg]:size-5">
          {icon}
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffRow({
  member,
  assignments,
  busy,
  onEdit,
  onToggle,
  onManageAccess,
}: {
  member: StaffMember;
  assignments: number;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onManageAccess: () => void;
}) {
  const initials = member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const departments = departmentsOf(member);
  return (
    <tr className="border-b last:border-0 hover:bg-[#fcfaf7] dark:hover:bg-[#241e17]">
      <td aria-label={`Staff member ${member.name}`} className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f5ead8] dark:bg-[#33291c] text-xs font-semibold text-[#70481c] ring-1 ring-[#e4d2b6]">
            {initials}
          </span>
          <div>
            <p className="font-semibold">{member.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Staff ID · SF-{String(member.id).padStart(4, '0')}
            </p>
            {member.user_id ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] px-1.5 py-0 text-[10px] text-[#70481c]">
                  {member.access_type === 'main' ? 'Main ID' : 'Staff ID'}
                </Badge>
                {departments.map((department) => (
                  <Badge key={department} variant="outline" className="px-1.5 py-0 text-[10px]">
                    {DEPARTMENT_META[department].label}
                  </Badge>
                ))}
                {!member.portal_active ? (
                  <Badge variant="outline" className="border-stone-200 bg-stone-50 px-1.5 py-0 text-[10px] text-stone-600 dark:border-border dark:bg-muted dark:text-muted-foreground">
                    Login disabled
                  </Badge>
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">No portal login</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Phone className="size-3.5" />
          {member.phone || 'Not added'}
        </span>
        {member.email ? <p className="mt-1 text-xs text-muted-foreground">{member.email}</p> : null}
      </td>
      <td className="px-5 py-4">
        <Badge
          variant="outline"
          className={member.staff_type === 'stylist' ? 'border-[#dfc6a4] bg-[#f5ead8] dark:bg-[#33291c] text-[#70481c]' : ''}
        >
          {member.staff_type === 'stylist' ? 'Stylist' : 'Regular staff'}
        </Badge>
      </td>
      <td className="px-5 py-4">
        <Badge
          variant="outline"
          className={
            member.is_active
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
          }
        >
          {member.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="px-5 py-4">
        <span className="font-semibold">{assignments}</span>
        <span className="ml-1 text-xs text-muted-foreground">bookings</span>
      </td>
      <td className="px-5 py-4 text-muted-foreground">
        {friendlyDate(member.created_at)}
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onManageAccess}
            aria-label={`${member.user_id ? 'Manage access for' : 'Create login for'} ${member.name}`}
          >
            <KeyRound />
            {member.user_id ? 'Manage access' : 'Create login'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            aria-label={`Edit ${member.name}`}
          >
            <Pencil />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onToggle}
            aria-label={`${member.is_active ? 'Deactivate' : 'Activate'} ${member.name}`}
            className={
              member.is_active
                ? 'text-muted-foreground hover:text-destructive'
                : 'text-emerald-700'
            }
          >
            {member.is_active ? <UserX /> : <UserCheck />}
            {busy ? 'Saving…' : member.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function StaffDialog({
  member,
  onClose,
  onSaved,
}: {
  member: StaffMember | null;
  onClose: () => void;
  onSaved: (member: StaffMember) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showLoginSection = !member || !member.user_id;
  const loginRequired = showLoginSection;
  const [accessType, setAccessType] = useState<StaffAccessType>('staff');
  const [staffType, setStaffType] = useState<StaffType>('regular');
  const [portalKind, setPortalKind] = useState<StaffPortalKind>('staff');
  const [departments, setDepartments] = useState<StaffDepartment[]>([]);

  const effectiveDepartments = portalKind === 'manager'
    ? ([...STAFF_DEPARTMENTS] as StaffDepartment[])
    : portalKind === 'accounts'
      ? (['booking'] as StaffDepartment[])
      : staffType === 'stylist'
    ? (['stylist'] as StaffDepartment[])
    : accessType === 'staff' ? (['booking'] as StaffDepartment[]) : departments;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const readText = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const readExactText = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value : '';
    };
    const loginId = readText('loginId');
    const password = readExactText('password');
    const wantsLogin = showLoginSection;

    if (wantsLogin) {
      if (!loginId) {
        setError('Enter a Login ID so this staff member can sign in to the Staff Portal.');
        setBusy(false);
        return;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(loginId)) {
        setError('Use a simple Login ID such as deep.patel or staff-11. Do not enter an email address.');
        setBusy(false);
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        setBusy(false);
        return;
      }
      if (effectiveDepartments.length === 0) {
        setError('Select at least one department to grant portal access.');
        setBusy(false);
        return;
      }
    }

    const payload = {
      name: readText('name'),
      phone: readText('phone') || null,
      email: readText('email') || null,
      address: readText('address') || null,
      is_active: readText('status') === 'active',
    };
    const result = await saveStaffMemberAction(
      member ? { id: member.id, ...payload } : payload,
    );
    if (result.error || !result.data) {
      setError(result.error || 'Staff member could not be saved.');
      setBusy(false);
      return;
    }

    const savedMember = result.data as StaffMember;

    if (wantsLogin) {
      const loginResult = await createStaffLoginAction({
        staffMemberId: savedMember.id,
        name: savedMember.name,
        loginId,
        password,
        departments: effectiveDepartments,
        accessType,
        staffType,
        portalKind,
        modules: portalKind === 'accounts' ? ACCOUNTS_PORTAL_MODULES : portalKind === 'manager' ? MANAGER_PORTAL_MODULES : [],
        rollbackStaffMemberOnFailure: !member,
      });
      if (loginResult.error || !loginResult.account) {
        setError(
          member
            ? `The staff details were saved, but the portal login was not created: ${loginResult.error ?? 'Unknown error.'}`
            : `Nothing was saved because the portal login could not be created: ${loginResult.error ?? 'Unknown error.'}`,
        );
        setBusy(false);
        return;
      }
      onSaved({
        ...savedMember,
        is_active: true,
        user_id: loginResult.account.id,
        login_id: loginResult.account.loginId,
        portal_active: loginResult.account.active,
        access_type: loginResult.account.accessType,
        staff_type: loginResult.account.staffType,
        portal_kind: loginResult.account.portalKind,
        staff_departments: loginResult.account.departments.map((grant) => ({ department: grant.department })),
        staff_access_modules: loginResult.account.modules.map((module) => ({ module, enabled: true })),
      });
      return;
    }

    onSaved(savedMember);
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#211d18]/70 p-4 backdrop-blur-sm">
      <dialog
        open
        aria-labelledby="staff-dialog-title"
        className="relative m-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[22px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)]"
      >
        <div className="flex items-start justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-5 sm:px-6">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-[#e4d2b6]">
              <UserRound className="size-5" />
            </span>
            <div>
              <h2
                id="staff-dialog-title"
                className="text-lg font-semibold tracking-[-0.03em]"
              >
                {member ? 'Edit staff member' : 'Add staff member'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {member
                  ? 'Update the team member’s directory information.'
                  : 'Create the staff member and their verified portal login together.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close staff popup"
            className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
          <label className="block text-sm">
            <span className="font-medium">Full name</span>
            <input
              name="name"
              required
              minLength={2}
              defaultValue={member?.name ?? ''}
              placeholder="Enter staff member’s name"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone number</span>
            <input
              name="phone"
              type="tel"
              defaultValue={member?.phone ?? ''}
              placeholder="Enter contact number"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={member?.email ?? ''}
              placeholder="Enter email address"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Address</span>
            <input
              name="address"
              defaultValue={member?.address ?? ''}
              placeholder="Enter address"
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Staff status</span>
            <select
              name="status"
              defaultValue={member?.is_active === false ? 'inactive' : 'active'}
              className={fieldClass}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          {showLoginSection ? (
            <div className="space-y-4 rounded-xl border border-dashed border-[#e4d2b6] bg-[#fcfaf7] dark:bg-[#241e17] p-4">
              <div>
                <p className="text-sm font-medium">Portal login (required)</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A working Staff Portal login will be created and verified when these details are saved.
                </p>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Login ID</span>
                <input name="loginId" required={loginRequired} placeholder="e.g. deep.patel" className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Temporary password</span>
                <input name="password" type="password" required={loginRequired} minLength={6} placeholder="At least 6 characters" className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Portal role</span>
                <select
                  value={portalKind}
                  onChange={(event) => setPortalKind(event.target.value as StaffPortalKind)}
                  className={fieldClass}
                >
                  <option value="staff">Staff Portal</option>
                  <option value="accounts">Accounts Portal</option>
                  <option value="manager">Manager Portal</option>
                </select>
              </label>
              {portalKind === 'staff' ? <label className="block text-sm">
                <span className="font-medium">Staff type</span>
                <select
                  value={staffType}
                  onChange={(event) => setStaffType(event.target.value as StaffType)}
                  className={fieldClass}
                >
                  <option value="regular">Regular staff</option>
                  <option value="stylist">Stylist</option>
                </select>
              </label> : null}
              {portalKind === 'staff' && staffType === 'regular' ? <label className="block text-sm">
                <span className="font-medium">Access type</span>
                <select
                  value={accessType}
                  onChange={(event) => setAccessType(event.target.value as StaffAccessType)}
                  className={fieldClass}
                >
                  <option value="staff">Staff ID — booking quotations only</option>
                  <option value="main">Main ID — choose departments</option>
                </select>
              </label> : null}
              {portalKind === 'accounts' ? (
                <div className="rounded-lg border border-[#e4d2b6] bg-[#f5ead8] p-3 text-xs text-[#70481c] dark:bg-[#33291c]">
                  Accounts Portal includes bookings, quotations, customers, ledgers, challans, vouchers and expenses.
                </div>
              ) : portalKind === 'manager' ? (
                <div className="rounded-lg border border-[#e4d2b6] bg-[#f5ead8] p-3 text-xs text-[#70481c] dark:bg-[#33291c]">
                  Manager Portal includes the complete operational module set and all departments.
                </div>
              ) : staffType === 'regular' && accessType === 'main' ? (
                <div>
                  <p className="text-sm font-medium">Departments</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {STAFF_DEPARTMENTS.map((department) => (
                      <label key={department} className="flex gap-2 rounded-lg border bg-white dark:bg-card p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={departments.includes(department)}
                          onChange={(event) =>
                            setDepartments((rows) =>
                              event.target.checked ? [...rows, department] : rows.filter((item) => item !== department),
                            )
                          }
                        />
                        <span>{DEPARTMENT_META[department].label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : staffType === 'stylist' ? (
                <div className="rounded-lg border border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] p-3 text-xs text-[#70481c]">
                  Fixed to the Stylist Portal — rental opportunities, assigned events and personal notifications.
                </div>
              ) : (
                <div className="rounded-lg border border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] p-3 text-xs text-[#70481c]">
                  Fixed to the Booking department — quote-only access, payment fields locked.
                </div>
              )}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Staff member was not saved</AlertTitle>
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
              {busy ? 'Saving…' : member ? 'Save changes' : 'Add staff & create login'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#211d18]/70 p-4 backdrop-blur-sm sm:p-6">
      <dialog open className="relative m-0 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}

function AccessDialog({
  member,
  onClose,
  onPatch,
}: {
  member: StaffMember;
  onClose: () => void;
  onPatch: (patch: Partial<StaffMember>) => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [pending, startTransition] = useTransition();
  const departments = departmentsOf(member);
  const modules = modulesOf(member);

  if (!member.user_id) {
    return (
      <Modal title={`Create login · ${member.name}`} subtitle="Give this staff member a Staff Portal / admin login." onClose={onClose}>
        <CreateLoginForm member={member} onClose={onClose} onCreated={(patch) => { onPatch(patch); onClose(); }} />
      </Modal>
    );
  }

  return (
    <Modal title={`Manage access · ${member.name}`} subtitle={`Login ID: ${member.login_id}`} onClose={onClose}>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] text-[#70481c]">
            {member.access_type === 'main' ? 'Main ID' : 'Staff ID'}
          </Badge>
          <Badge variant="outline" className={member.portal_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}>
            {member.portal_active ? 'Login active' : 'Login disabled'}
          </Badge>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Portal role</span>
          <select
            value={member.portal_kind ?? 'staff'}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value as StaffPortalKind;
              startTransition(async () => {
                const result = await setStaffPortalKindAction(member.user_id as string, next);
                if (result.error) return;
                const nextDepartments: StaffDepartment[] = next === 'manager' ? [...STAFF_DEPARTMENTS] : ['booking'];
                const nextModules: AccessModule[] = next === 'accounts'
                  ? ACCOUNTS_PORTAL_MODULES
                  : next === 'manager'
                    ? MANAGER_PORTAL_MODULES
                    : ['quotations', 'create_booking'];
                onPatch({
                  portal_kind: next,
                  staff_type: 'regular',
                  access_type: next === 'staff' ? 'staff' : 'main',
                  staff_departments: nextDepartments.map((department) => ({ department })),
                  staff_access_modules: nextModules.map((module) => ({ module, enabled: true })),
                });
              });
            }}
            className={fieldClass}
          >
            <option value="staff">Staff Portal</option>
            <option value="accounts">Accounts Portal</option>
            <option value="manager">Manager Portal</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Accounts and Manager roles apply a secure access preset automatically.
          </span>
        </label>

        {(member.portal_kind ?? 'staff') === 'staff' ? <label className="block text-sm">
          <span className="font-medium">Staff type</span>
          <select
            value={member.staff_type === 'stylist' ? 'stylist' : 'regular'}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value as StaffType;
              startTransition(async () => {
                await setStaffTypeAction(member.user_id as string, next);
                const department: StaffDepartment = next === 'stylist' ? 'stylist' : 'booking';
                onPatch({
                  staff_type: next,
                  access_type: 'staff',
                  staff_departments: [{ department }],
                  staff_access_modules: next === 'stylist'
                    ? []
                    : [
                        { module: 'quotations', enabled: true },
                        { module: 'create_booking', enabled: true },
                      ],
                });
              });
            }}
            className={fieldClass}
          >
            <option value="regular">Regular staff</option>
            <option value="stylist">Stylist</option>
          </select>
        </label> : null}

        {(member.portal_kind ?? 'staff') !== 'staff' ? (
          <div className="rounded-xl border border-[#e4d2b6] bg-[#fffaf2] p-4 text-sm dark:bg-[#241e17]">
            <p className="font-medium text-[#70481c]">
              {member.portal_kind === 'accounts' ? 'Accounts Portal' : 'Manager Portal'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {member.portal_kind === 'accounts'
                ? 'Focused access to bookings, quotations, customers, ledgers, challans, vouchers and expenses.'
                : 'Broad access to operational departments and management modules.'}
            </p>
          </div>
        ) : member.staff_type !== 'stylist' && member.access_type === 'main' ? (
          <div>
            <p className="text-sm font-medium">Departments</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {STAFF_DEPARTMENTS.map((department) => {
              const checked = departments.includes(department);
              return (
                <label key={department} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                  <input
                    aria-label={`${DEPARTMENT_META[department].label} department access`}
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    onChange={(event) => {
                      const next = event.target.checked;
                      startTransition(async () => {
                        await setStaffDepartmentAction(member.user_id as string, department, next);
                        const nextDepartments = next
                          ? [...departments, department]
                          : departments.filter((item) => item !== department);
                        onPatch({ staff_departments: nextDepartments.map((item) => ({ department: item })) });
                      });
                    }}
                  />
                  <span>
                    <strong className="block">{DEPARTMENT_META[department].label}</strong>
                    <span className="text-xs text-muted-foreground">{DEPARTMENT_META[department].description}</span>
                  </span>
                </label>
              );
            })}
            </div>
          </div>
        ) : member.staff_type === 'stylist' ? (
          <div className="rounded-xl border border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17] p-4 text-sm">
            <p className="font-medium text-[#70481c]">Stylist Portal</p>
            <p className="mt-1 text-muted-foreground">This personal login sees rental opportunities, its own applications, assignments and notifications.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#e4d2b6] bg-[#fffaf2] dark:bg-[#241e17] p-4 text-sm">
            <p className="font-medium text-[#70481c]">Booking department</p>
            <p className="mt-1 text-muted-foreground">
              This Staff ID opens quote creation in the Staff Portal only.
            </p>
          </div>
        )}

        {(member.portal_kind ?? 'staff') === 'staff' && member.staff_type !== 'stylist' && member.access_type === 'main' ? (
          <div>
            <p className="text-sm font-medium">Module access</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ACCESS_MODULES.map((module) => {
                const enabled = modules.includes(module);
                return (
                  <label key={module} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                    <span>
                      <strong className="block">{ACCESS_MODULE_META[module].label}</strong>
                      <span className="text-xs text-muted-foreground">{ACCESS_MODULE_META[module].description}</span>
                    </span>
                    <input
                      aria-label={`${ACCESS_MODULE_META[module].label} module access`}
                      type="checkbox"
                      checked={enabled}
                      disabled={pending}
                      onChange={(event) => {
                        const next = event.target.checked;
                        startTransition(async () => {
                          await setStaffModuleAction(member.user_id as string, module, next);
                          const nextModules = next ? [...modules, module] : modules.filter((item) => item !== module);
                          onPatch({ staff_access_modules: nextModules.map((item) => ({ module: item, enabled: true })) });
                        });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : member.staff_type === 'stylist' ? null : (
          <div className="rounded-xl border border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] p-4 text-sm text-[#70481c]">
            <strong>Fixed quote-only access</strong>
            <p className="mt-1">Payment fields are locked and Create Order is unavailable for Staff IDs.</p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => setResetting(true)}>
            <KeyRound />
            Reset password
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const next = !member.portal_active;
              startTransition(async () => {
                await setStaffLoginActiveAction(member.user_id as string, next);
                onPatch({ portal_active: next });
              });
            }}
          >
            {member.portal_active ? <ShieldOff /> : <ShieldCheck />}
            {member.portal_active ? 'Disable login' : 'Enable login'}
          </Button>
          <Button type="button" onClick={onClose}>Done</Button>
        </div>
      </div>
      {resetting ? (
        <PasswordDialog member={member} onClose={() => setResetting(false)} />
      ) : null}
    </Modal>
  );
}

function CreateLoginForm({
  member,
  onClose,
  onCreated,
}: {
  member: StaffMember;
  onClose: () => void;
  onCreated: (patch: Partial<StaffMember>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accessType, setAccessType] = useState<StaffAccessType>('staff');
  const [staffType, setStaffType] = useState<StaffType>('regular');
  const [portalKind, setPortalKind] = useState<StaffPortalKind>('staff');
  const [departments, setDepartments] = useState<StaffDepartment[]>([]);
  const [modules, setModules] = useState<AccessModule[]>([]);

  const effectiveDepartments = portalKind === 'manager'
    ? ([...STAFF_DEPARTMENTS] as StaffDepartment[])
    : portalKind === 'accounts'
      ? (['booking'] as StaffDepartment[])
      : staffType === 'stylist'
    ? (['stylist'] as StaffDepartment[])
    : accessType === 'staff' ? (['booking'] as StaffDepartment[]) : departments;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const loginId = formText(form, 'loginId').trim();
    const password = formText(form, 'password');
    const name = formText(form, 'name').trim() || member.name;
    if (!/^[a-zA-Z0-9._-]+$/.test(loginId)) {
      setError('Use a simple Login ID such as deep.patel or staff-11. Do not enter an email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (effectiveDepartments.length === 0) {
      setError('Select at least one department.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await createStaffLoginAction({
      staffMemberId: member.id,
      name,
      loginId,
      password,
      departments: effectiveDepartments,
      accessType,
      staffType,
      portalKind,
      modules: portalKind === 'accounts' ? ACCOUNTS_PORTAL_MODULES : portalKind === 'manager' ? MANAGER_PORTAL_MODULES : modules,
    });
    setBusy(false);
    if (result.error || !result.account) {
      setError(result.error ?? 'Could not create this login.');
      return;
    }
    onCreated({
      is_active: true,
      user_id: result.account.id,
      login_id: result.account.loginId,
      portal_active: result.account.active,
      access_type: result.account.accessType,
      staff_type: result.account.staffType,
      portal_kind: result.account.portalKind,
      staff_departments: result.account.departments.map((grant) => ({ department: grant.department })),
      staff_access_modules: result.account.modules.map((module) => ({ module, enabled: true })),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3.5 p-5">
      <label className="block text-sm">
        <span className="font-medium">Display name</span>
        <input name="name" defaultValue={member.name} className={fieldClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Login ID</span>
        <input name="loginId" required placeholder="e.g. deep.patel" className={fieldClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Temporary password</span>
        <input name="password" type="password" required minLength={6} className={fieldClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Portal role</span>
        <select value={portalKind} onChange={(event) => setPortalKind(event.target.value as StaffPortalKind)} className={fieldClass}>
          <option value="staff">Staff Portal</option>
          <option value="accounts">Accounts Portal</option>
          <option value="manager">Manager Portal</option>
        </select>
      </label>
      {portalKind === 'staff' ? <label className="block text-sm">
        <span className="font-medium">Staff type</span>
        <select value={staffType} onChange={(event) => setStaffType(event.target.value as StaffType)} className={fieldClass}>
          <option value="regular">Regular staff</option>
          <option value="stylist">Stylist</option>
        </select>
      </label> : null}
      {portalKind === 'staff' && staffType === 'regular' ? <label className="block text-sm">
        <span className="font-medium">Access type</span>
        <select
          value={accessType}
          onChange={(event) => setAccessType(event.target.value as StaffAccessType)}
          className={fieldClass}
        >
          <option value="staff">Staff ID — booking quotations only</option>
          <option value="main">Main ID — choose departments &amp; modules</option>
        </select>
      </label> : null}

      {portalKind === 'accounts' ? (
        <div className="rounded-xl border border-[#e4d2b6] bg-[#f5ead8] p-4 text-sm text-[#70481c] dark:bg-[#33291c]">
          <strong>Accounts Portal preset</strong>
          <p className="mt-1">Bookings, quotations, customers, ledgers, challans, vouchers and expenses.</p>
        </div>
      ) : portalKind === 'manager' ? (
        <div className="rounded-xl border border-[#e4d2b6] bg-[#f5ead8] p-4 text-sm text-[#70481c] dark:bg-[#33291c]">
          <strong>Manager Portal preset</strong>
          <p className="mt-1">All operational departments and management modules.</p>
        </div>
      ) : staffType === 'regular' && accessType === 'main' ? (
        <div>
          <p className="text-sm font-medium">Departments</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {STAFF_DEPARTMENTS.map((department) => (
              <label key={department} className="flex gap-2 rounded-lg border p-3 text-sm">
                <input
                  aria-label={`${DEPARTMENT_META[department].label} department access`}
                  type="checkbox"
                  checked={departments.includes(department)}
                  onChange={(event) =>
                    setDepartments((rows) =>
                      event.target.checked ? [...rows, department] : rows.filter((item) => item !== department),
                    )
                  }
                />
                <span>{DEPARTMENT_META[department].label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : staffType === 'stylist' ? (
        <div className="rounded-xl border border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] p-4 text-sm text-[#70481c]">
          <strong>Fixed to the Stylist Portal</strong>
          <p className="mt-1">Rental opportunities, assigned events and personal notifications only.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e4d2b6] bg-[#f5ead8] dark:bg-[#33291c] p-4 text-sm text-[#70481c]">
          <strong>Fixed to the Booking department</strong>
          <p className="mt-1">This login can prepare and save quotations only — payment fields are locked and Create Order is unavailable.</p>
        </div>
      )}

      {portalKind === 'staff' && staffType === 'regular' && accessType === 'main' ? (
        <div>
          <p className="text-sm font-medium">Module access</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ACCESS_MODULES.map((module) => (
              <label key={module} className="flex gap-2 rounded-lg border p-3 text-sm">
                <input
                  aria-label={`${ACCESS_MODULE_META[module].label} module access`}
                  type="checkbox"
                  checked={modules.includes(module)}
                  onChange={(event) =>
                    setModules((rows) => (event.target.checked ? [...rows, module] : rows.filter((item) => item !== module)))
                  }
                />
                <span>
                  <strong className="block">{ACCESS_MODULE_META[module].label}</strong>
                  <span className="text-xs text-muted-foreground">{ACCESS_MODULE_META[module].description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy}>
          <Check />
          {busy ? 'Creating…' : 'Create login'}
        </Button>
      </div>
    </form>
  );
}

function PasswordDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = formText(new FormData(event.currentTarget), 'password');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    await resetStaffLoginPasswordAction(member.user_id as string, password);
    setBusy(false);
    onClose();
  }
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#211d18]/70 p-4 backdrop-blur-sm">
      <dialog open className="m-0 w-full max-w-md rounded-[22px] border border-white/40 bg-[#fffdf9] dark:bg-[#241e17] p-0 text-foreground shadow-[0_32px_90px_rgb(20_15_10_/.35)]">
        <div className="flex justify-between border-b bg-[#fcfaf7] dark:bg-[#241e17] px-5 py-5">
          <div>
            <h2 className="text-lg font-semibold">{`Reset password · ${member.name}`}</h2>
            <p className="mt-1 text-xs text-muted-foreground">The existing password is never displayed.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-full border bg-white dark:bg-card">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <input name="password" type="password" required minLength={6} placeholder="New password" className={fieldClass.replace('mt-1.5', 'mt-0')} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy}>
              <Check />
              {busy ? 'Saving…' : 'Save password'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
