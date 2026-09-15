import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardHeader } from '@/components/layout/dashboard-header';
import { StaffPortalShell } from '@/components/staff-portal/staff-portal-shell';
import {
  DEPARTMENT_META,
  STAFF_DEPARTMENTS,
  type StaffDepartment,
} from '@/lib/staff-portal/constants';
import { ACCESS_MODULE_META } from '@/lib/staff-portal/access-modules';
import { STAFF_MODULE_META } from '@/lib/staff-portal/modules';
import { requireStaffSession } from '@/lib/staff-portal/guard';
import { unreadCountForSession } from '@/lib/notifications/store';
import { listJobs } from '@/lib/event-jobs/store';
import { Boxes, CheckCircle2, Clock3, PackageCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ denied?: string }>;
};

export default async function StaffPortalHomePage({ searchParams }: Props) {
  const session = await requireStaffSession();
  const isSpecialPortal = session.portalKind === 'accounts' || session.portalKind === 'manager';
  const isBookingMainId =
    !isSpecialPortal &&
    session.isMainId &&
    session.departments.some(
      (grant) => grant.active && grant.department === 'booking',
    );
  if (isBookingMainId) redirect('/staff-portal/booking');
  const params = await searchParams;
  const activeDepartments = session.departments.filter((grant) => grant.active);
  const isWarehouseStaff = activeDepartments.some(
    (grant) => grant.department === 'warehouse',
  );
  if (!isSpecialPortal && isWarehouseStaff) redirect('/staff-portal/warehouse');
  const isQcStaff = activeDepartments.some(
    (grant) => grant.department === 'qc',
  );
  if (!isSpecialPortal && isQcStaff) redirect('/staff-portal/qc');
  const isCollectionStaff = activeDepartments.some(
    (grant) => grant.department === 'collection',
  );
  if (!isSpecialPortal && isCollectionStaff) redirect('/staff-portal/collection');
  const isStylistStaff = activeDepartments.some(
    (grant) => grant.department === 'stylist',
  );
  const isModificationStaff = activeDepartments.some(
    (grant) => grant.department === 'modification',
  );
  if (!isSpecialPortal && isModificationStaff) redirect('/staff-portal/modifications');
  if (!isSpecialPortal && isStylistStaff) redirect('/staff-portal/stylist');
  const isBookingStaff =
    !session.isMainId &&
    activeDepartments.some((grant) => grant.department === 'booking');
  const rawModuleCards = isBookingStaff
    ? [
        { key: 'create-booking', ...ACCESS_MODULE_META.create_booking },
        { key: 'quotations', ...ACCESS_MODULE_META.quotations },
      ]
    : isSpecialPortal
      ? session.accessModules.map((module) => ({
          key: `access-${module}`,
          ...ACCESS_MODULE_META[module],
        }))
      : [
        ...session.accessModules.map((module) => ({
          key: `access-${module}`,
          ...ACCESS_MODULE_META[module],
        })),
        ...session.permissions.map((module) => ({
          key: `staff-${module}`,
          ...STAFF_MODULE_META[module],
        })),
        ];
  const seenModuleHrefs = new Set<string>();
  const moduleCards = rawModuleCards.flatMap((module) => {
    if (!module.href || seenModuleHrefs.has(module.href)) return [];
    seenModuleHrefs.add(module.href);
    return [{ ...module, href: module.href }];
  });
  const hasWarehouse = activeDepartments.some(
    (grant) => grant.department === 'warehouse',
  );
  const hasQc = activeDepartments.some((grant) => grant.department === 'qc');
  const departmentJobs =
    hasWarehouse || hasQc
      ? await listJobs()
      : [];
  const warehouseJobs = hasWarehouse ? departmentJobs : [];
  const openWarehouseJobs = warehouseJobs.filter(
    (job) =>
      job.status === 'active' &&
      job.stages.some(
        (stage) =>
          (stage.key === 'warehouse_pick' ||
            stage.key === 'return_warehouse') &&
          (stage.status === 'open' || stage.status === 'in_progress'),
      ),
  );
  const closedWarehouseJobs = warehouseJobs.filter(
    (job) =>
      !job.stages.some(
        (stage) =>
          (stage.key === 'warehouse_pick' ||
            stage.key === 'return_warehouse') &&
          (stage.status === 'open' || stage.status === 'in_progress'),
      ) && Boolean(job.warehousePrep || job.returnWarehouseCheck),
  );
  const qcJobs = hasQc ? departmentJobs : [];
  const hasOpenQcStage = (job: (typeof qcJobs)[number]) =>
    job.stages.some(
      (stage) =>
        ['quality_check', 'packing', 'return_quality_check'].includes(
          stage.key,
        ) &&
        (stage.status === 'open' || stage.status === 'in_progress'),
    );
  const openQcJobs = qcJobs.filter(
    (job) => job.status === 'active' && hasOpenQcStage(job),
  );
  const closedQcJobs = qcJobs.filter(
    (job) =>
      !hasOpenQcStage(job) &&
      Boolean(
        job.qualityCheck || job.packingChecklist || job.returnQualityCheck,
      ),
  );
  const deniedDepartment = STAFF_DEPARTMENTS.includes(
    params.denied as StaffDepartment,
  )
    ? (params.denied as StaffDepartment)
    : null;
  const notificationCount = await unreadCountForSession(
    session.id,
    activeDepartments.map((grant) => grant.department),
  );

  if (isModificationStaff) {
    return (
      <StaffPortalShell
        name={session.name}
        departments={session.departments}
        permissions={session.permissions}
        accessModules={session.accessModules}
        isMainId={session.isMainId}
        portalKind={session.portalKind}
        notificationCount={notificationCount}
      >
        <div className="mx-auto max-w-[960px] space-y-5">
          <DashboardHeader
            title="Modification Dashboard"
            subtitle="A simple view of your modification work"
          />
          <Card className="border-border shadow-level-1">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">Modification work queue</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open sale-booking requests, update their progress, and mark completed work.
                </p>
              </div>
              <Link href="/staff-portal/modifications" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
                Open Modifications
              </Link>
            </CardContent>
          </Card>
        </div>
      </StaffPortalShell>
    );
  }

  return (
    <StaffPortalShell
      name={session.name}
      departments={session.departments}
      permissions={session.permissions}
      accessModules={session.accessModules}
      isMainId={session.isMainId}
      portalKind={session.portalKind}
      notificationCount={notificationCount}
    >
      <div className="mx-auto max-w-[1440px] space-y-6">
        <DashboardHeader
          title={session.portalKind === 'accounts' ? 'Accounts Portal' : session.portalKind === 'manager' ? 'Manager Portal' : `Welcome, ${session.name}`}
          subtitle={session.portalKind === 'accounts'
            ? `Welcome, ${session.name} · Finance and customer accounts`
            : session.portalKind === 'manager'
              ? `Welcome, ${session.name} · Business operations overview`
              : 'Your Safawala staff portal'}
        />

        {deniedDepartment ? (
          <Alert variant="destructive">
            <AlertTitle>Access not granted</AlertTitle>
            <AlertDescription>
              You don&rsquo;t have {DEPARTMENT_META[deniedDepartment].label}{' '}
              access. Ask your admin to grant it from Manage Access if you need
              it.
            </AlertDescription>
          </Alert>
        ) : null}

        {hasWarehouse ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/staff-portal/warehouse"
              className="rounded-xl border border-[#d6b98d] bg-[#f5ead8] p-4 text-[#70481c] shadow-sm transition hover:shadow-level-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Clock3 className="size-4" /> Open warehouse jobs
              </span>
              <span className="mt-2 flex items-end justify-between">
                <strong className="text-3xl">{openWarehouseJobs.length}</strong>
                <Boxes className="size-5" />
              </span>
            </Link>
            <Link
              href="/staff-portal/warehouse?view=closed"
              className="rounded-xl border bg-white dark:bg-card p-4 shadow-sm transition hover:bg-[#fcfaf7] dark:hover:bg-[#241e17] hover:shadow-level-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-emerald-700" /> Closed
                warehouse jobs
              </span>
              <strong className="mt-2 block text-3xl">
                {closedWarehouseJobs.length}
              </strong>
            </Link>
          </div>
        ) : null}

        {hasQc ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/staff-portal/qc"
              className="rounded-xl border border-[#d6b98d] bg-[#f5ead8] p-4 text-[#70481c] shadow-sm transition hover:shadow-level-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Clock3 className="size-4" /> Open QC jobs
              </span>
              <span className="mt-2 flex items-end justify-between">
                <strong className="text-3xl">{openQcJobs.length}</strong>
                <PackageCheck className="size-5" />
              </span>
            </Link>
            <Link
              href="/staff-portal/qc?view=closed"
              className="rounded-xl border bg-white dark:bg-card p-4 shadow-sm transition hover:bg-[#fcfaf7] dark:hover:bg-[#241e17] hover:shadow-level-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-emerald-700" /> Closed QC
                jobs
              </span>
              <strong className="mt-2 block text-3xl">
                {closedQcJobs.length}
              </strong>
            </Link>
          </div>
        ) : null}

        {moduleCards.length === 0 ? (
          <Card className="border-border shadow-level-1">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No active department is assigned to this staff account.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map((module) => (
              <Link key={module.key} href={module.href} className="block">
                <Card className="border-border shadow-level-1 transition hover:shadow-level-2">
                  <CardContent className="p-5">
                    <p className="font-semibold">{module.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {module.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StaffPortalShell>
  );
}
