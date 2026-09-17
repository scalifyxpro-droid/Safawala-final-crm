'use client';

import { useState, type ReactNode } from 'react';
import { DashboardHeaderContext, type PageHeader } from '@/components/layout/dashboard-header-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
import { TeamChatWidget } from '@/components/team-chat/team-chat-widget';
import { StaffLanguageProvider, useStaffLanguage, type StaffLanguage } from '@/components/staff-portal/staff-language';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ArrowLeft } from 'lucide-react';
import { staffLogoutAction } from '@/lib/staff-portal/logout-action';
import { DEPARTMENT_META } from '@/lib/staff-portal/constants';
import type { StaffDepartmentGrant, StaffPortalKind } from '@/lib/staff-portal/types';
import type { StaffModule } from '@/lib/staff-portal/modules';
import {
  ACCESS_MODULE_META,
  type AccessModule,
} from '@/lib/staff-portal/access-modules';
import { STAFF_MODULE_META } from '@/lib/staff-portal/modules';
import {
  Bell,
  Boxes,
  CalendarDays,
  ChevronUp,
  CircleCheckBig,
  CircleGauge,
  ClipboardCheck,
  IndianRupee,
  ClipboardList,
  LayoutDashboard,
  Languages,
  LogOut,
  Menu,
  PackageCheck,
  Sparkles,
  Plus,
  ReceiptText,
  UserRound,
  UsersRound,
  Wrench,
} from 'lucide-react';

function SidebarNavigation({
  modules,
  permissions,
  departments,
  isMainId,
  portalKind,
}: {
  modules: AccessModule[];
  permissions: StaffModule[];
  departments: StaffDepartmentGrant[];
  isMainId: boolean;
  portalKind: StaffPortalKind;
}) {
  const pathname = usePathname();
  const moduleIcons: Partial<Record<AccessModule, typeof LayoutDashboard>> = {
    dashboard: LayoutDashboard,
    quotations: ClipboardList,
    bookings: ReceiptText,
    create_booking: Plus,
    customers: UsersRound,
    vendors: UserRound,
    event_jobs: ClipboardList,
    calendar: CalendarDays,
    performance: CircleGauge,
    stylist_approvals: UserRound,
    travel: CalendarDays,
    modifications: Wrench,
    inventory: Boxes,
    packages: PackageCheck,
    ledger: IndianRupee,
    challans: ReceiptText,
    vouchers: ReceiptText,
    expenses: IndianRupee,
    reports: CircleGauge,
  };
  const isBookingPortal =
    portalKind === 'staff' &&
    isMainId &&
    departments.some((grant) => grant.active && grant.department === 'booking');
  const isBookingStaff =
    portalKind === 'staff' &&
    !isMainId &&
    departments.some((grant) => grant.active && grant.department === 'booking');
  const isWarehouseStaff = portalKind === 'staff' && departments.some(
    (grant) => grant.active && grant.department === 'warehouse',
  );
  const isQcStaff = portalKind === 'staff' && departments.some(
    (grant) => grant.active && grant.department === 'qc',
  );
  const isCollectionStaff = portalKind === 'staff' && departments.some(
    (grant) => grant.active && grant.department === 'collection',
  );
  const isStylistStaff = portalKind === 'staff' && departments.some(
    (grant) => grant.active && grant.department === 'stylist',
  );
  const isStylistMain = isMainId && isStylistStaff;
  const isModificationStaff = portalKind === 'staff' && departments.some(
    (grant) => grant.active && grant.department === 'modification',
  );
  const seen = new Set<string>();
  const links = portalKind === 'accounts' || portalKind === 'manager'
    ? [
        { href: '/staff-portal', label: 'Home', icon: LayoutDashboard },
        ...modules.map((module) => ({
          href: ACCESS_MODULE_META[module].href,
          label: ACCESS_MODULE_META[module].label,
          icon: moduleIcons[module] ?? LayoutDashboard,
        })),
      ]
    : isBookingPortal
    ? [
        {
          href: '/staff-portal/booking',
          label: 'Dashboard',
          icon: LayoutDashboard,
        },
        { href: '/bookings', label: 'All Bookings', icon: ReceiptText },
        { href: '/quotes', label: 'Quotes', icon: ClipboardList },
        { href: '/bookings/calendar', label: 'Calendar', icon: CalendarDays },
        {
          href: '/staff-portal/event-tracking',
          label: 'Event Tracking',
          icon: ClipboardList,
        },
        {
          href: '/staff-portal/booking/close-jobs',
          label: 'Close Jobs',
          icon: CircleCheckBig,
        },
        { href: '/modifications', label: 'Modifications', icon: Wrench },
        { href: '/customers', label: 'Customers', icon: UsersRound },
      ]
    : isBookingStaff
      ? [
          { href: '/staff-portal', label: 'Dashboard', icon: LayoutDashboard },
          { href: '/bookings/new', label: 'Create booking', icon: Plus },
          { href: '/quotes', label: 'Quotes', icon: ClipboardList },
        ]
      : isWarehouseStaff
        ? [
            {
              href: '/staff-portal/warehouse',
              label: 'Picking & Returns',
              icon: Boxes,
            },
          ]
        : isQcStaff
          ? [
              {
                href: '/staff-portal/qc',
                label: 'QC & Packing',
                icon: ClipboardCheck,
              },
            ]
          : isCollectionStaff
            ? [
                {
                  href: '/staff-portal/collection',
                  label: 'Collection',
                  icon: PackageCheck,
                },
              ]
              : isStylistMain
              ? [
                  {
                    href: '/staff-portal/stylist',
                    label: 'Stylist dashboard',
                    icon: LayoutDashboard,
                  },
                  {
                    href: '/staff-portal/stylist/assigned',
                    label: 'All assigned events',
                    icon: CalendarDays,
                  },
                ]
            : isModificationStaff
              ? [
                  {
                    href: '/staff-portal/modifications',
                    label: 'Modifications',
                    icon: Wrench,
                  },
                ]
            : isStylistStaff
              ? [
                  {
                    href: '/staff-portal/stylist',
                    label: 'Stylist opportunities',
                    icon: Sparkles,
                  },
                  {
                    href: '/staff-portal/stylist/assigned',
                    label: 'Assigned events',
                    icon: CalendarDays,
                  },
                ]
              : [
                  {
                    href: '/staff-portal',
                    label: 'Home',
                    icon: LayoutDashboard,
                  },
                  ...modules.flatMap((module) => {
                    const meta = ACCESS_MODULE_META[module];
                    if (!meta.href || seen.has(meta.href)) return [];
                    seen.add(meta.href);
                    return [
                      {
                        href: meta.href,
                        label: meta.label,
                        icon: moduleIcons[module] ?? LayoutDashboard,
                      },
                    ];
                  }),
                  ...permissions.flatMap((permission) => {
                    const meta = STAFF_MODULE_META[permission];
                    if (!meta.href || seen.has(meta.href)) return [];
                    seen.add(meta.href);
                    const permissionIcons: Partial<
                      Record<StaffModule, typeof LayoutDashboard>
                    > = {
                      warehouse_tasks: Boxes,
                      qc_tasks: PackageCheck,
                      event_jobs: ClipboardList,
                      event_tracking: ClipboardList,
                      calendar: CalendarDays,
                      my_tasks: ClipboardList,
                      attendance: CalendarDays,
                      performance: CircleGauge,
                      leave_management: CalendarDays,
                      collection_tasks: PackageCheck,
                      modification_tasks: Wrench,
                    };
                    return [
                      {
                        href: meta.href,
                        label: meta.label,
                        icon: permissionIcons[permission] ?? LayoutDashboard,
                      },
                    ];
                  }),
                ];
  const navigationLinks = portalKind === 'accounts' || portalKind === 'manager'
    ? links
    : [
        ...links,
        ...(links.some((link) => link.href === '/staff-portal/event-tracking')
          ? []
          : [{ href: '/staff-portal/event-tracking', label: 'Job Tracker', icon: ClipboardList }]),
        ...(links.some((link) => link.href === '/staff-portal/performance')
          ? []
          : [{ href: '/staff-portal/performance', label: 'My Performance', icon: CircleGauge }]),
      ];
  return (
    <nav aria-label="Primary navigation" className="mt-8 space-y-1">
      {navigationLinks.map(({ href, label, icon: Icon }) => {
        const matchesPath = (candidate: string) =>
          candidate === '/staff-portal'
            ? pathname === candidate
            : candidate === '/bookings'
              ? pathname === '/bookings' || /^\/bookings\/\d+/.test(pathname)
              : pathname === candidate || pathname.startsWith(`${candidate}/`);
        const isActive =
          matchesPath(href) &&
          !links.some(
            (other) =>
              other.href !== href &&
              other.href.length > href.length &&
              matchesPath(other.href),
          );
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex h-11 items-center gap-2.5 rounded-lg border px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'border-[#e4d2b6] bg-[#f5ead8] font-semibold text-[#70481c] dark:border-[#4a3c2a] dark:bg-[#33291c] dark:text-[#f0d9ad]' : 'border-transparent text-muted-foreground hover:bg-[#f7f4ef] dark:hover:bg-[#241e17] hover:text-foreground dark:hover:bg-[#241e17]'}`}
          >
            <span
              className={`grid size-7 place-items-center rounded-md ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <Icon aria-hidden="true" className="size-4" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountPanel({
  name,
  departments,
  portalKind,
}: {
  name: string;
  departments: StaffDepartmentGrant[];
  portalKind: StaffPortalKind;
}) {
  const [open, setOpen] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  const activeLabels = departments
    .filter((grant) => grant.active)
    .map((grant) => DEPARTMENT_META[grant.department].label);

  return (
    <div className="rounded-xl border border-[#e4d2b6] bg-[#fcfaf7] dark:bg-[#241e17] p-1.5 shadow-level-1 dark:border-[#3a2f22] dark:bg-[#241e17]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-[#f5ead8] dark:hover:bg-[#33291c]"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-[11px] font-semibold text-white shadow-sm"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-semibold">
            {name}
          </strong>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {portalKind === 'accounts'
              ? 'Accounts Portal'
              : portalKind === 'manager'
                ? 'Manager Portal'
                : activeLabels.length
                  ? activeLabels.join(', ')
                  : 'No department access'}
          </span>
        </span>
        <ChevronUp
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted-foreground transition ${open ? '' : 'rotate-180'}`}
        />
      </button>
      {open ? (
        <form action={staffLogoutAction}>
          <Button
            type="submit"
            variant="ghost"
            className="mt-1 h-9 w-full justify-start px-3 text-muted-foreground hover:bg-red-50 hover:text-destructive dark:hover:bg-destructive/15"
            aria-label="Log out of the staff portal"
          >
            <LogOut aria-hidden="true" />
            <span>Log out</span>
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function BrandDivider() {
  return <div aria-hidden="true" className="mt-5 h-px bg-[#cec5b9] dark:bg-[#332b21]" />;
}

function LanguageSelector() {
  const { language, setLanguage, saving, error } = useStaffLanguage();
  return <div className="pointer-events-auto relative flex h-9 w-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#dfd3c3] bg-[#fcfaf7] text-[#70481c] shadow-sm dark:border-[#3a2f22] dark:bg-[#241e17] dark:text-[#f0d9ad] sm:w-auto sm:px-2">
    <Languages aria-hidden="true" className="size-4" />
    <span aria-hidden="true" className="text-[10px] font-bold sm:hidden">{language.toUpperCase()}</span>
    <label className="sr-only" htmlFor="staff-language">Staff portal language</label>
    <select id="staff-language" value={language} disabled={saving} onChange={(event) => void setLanguage(event.target.value as StaffLanguage)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:ring-2 focus-visible:ring-ring sm:static sm:h-8 sm:w-[92px] sm:bg-transparent sm:text-sm sm:font-semibold sm:opacity-100" aria-describedby={error ? 'staff-language-error' : undefined}>
      <option value="en">English</option>
      <option value="hi">हिन्दी</option>
      <option value="gu">ગુજરાતી</option>
    </select>
    {error ? <span id="staff-language-error" role="alert" className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-red-200 bg-white p-2 text-xs text-red-700 shadow-level-2 dark:bg-card">{error}</span> : null}
  </div>;
}

export function StaffPortalShell({
  name,
  departments,
  children,
  notificationCount = 0,
  accessModules,
  permissions = [],
  isMainId = false,
  portalKind = 'staff',
  language = 'en',
}: {
  name: string;
  departments: StaffDepartmentGrant[];
  children: ReactNode;
  notificationCount?: number;
  permissions?: StaffModule[];
  accessModules?: AccessModule[];
  isMainId?: boolean;
  portalKind?: StaffPortalKind;
  language?: StaffLanguage;
}) {
  const effectiveModules = accessModules ?? [];
  const [pageHeader, setPageHeader] = useState<PageHeader>(null);
  return (
    <DashboardHeaderContext.Provider value={setPageHeader}><StaffLanguageProvider initialLanguage={language}><div className="min-h-dvh w-full min-w-0 max-w-full overflow-x-clip bg-surface">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white dark:bg-card px-4 py-6 dark:bg-card lg:flex">
        <BrandMark className="px-2" />
        <BrandDivider />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNavigation
            modules={effectiveModules}
            permissions={permissions}
            departments={departments}
            isMainId={isMainId}
            portalKind={portalKind}
          />
        </div>
        <div className="mt-4">
          <AccountPanel name={name} departments={departments} portalKind={portalKind} />
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Safawala {portalKind === 'accounts' ? 'Accounts' : portalKind === 'manager' ? 'Manager' : 'Staff'} Portal
          </p>
        </div>
      </aside>

      <div className="w-full min-w-0 max-w-full lg:pl-64">
        <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-border/80 bg-white/95 px-3 shadow-[0_1px_0_rgba(98,68,38,0.04)] backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:bg-card/95 sm:px-6 lg:left-64 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Sheet>
              <SheetTrigger
                aria-label="Open navigation"
                className="pointer-events-auto inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#dfd3c3] bg-[#fcfaf7] text-[#70481c] shadow-sm transition hover:bg-[#f5ead8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#3a2f22] dark:bg-[#241e17] dark:text-[#f0d9ad] dark:hover:bg-[#33291c] lg:hidden"
              >
                <Menu aria-hidden="true" className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col border-border bg-white dark:bg-card px-4 py-6 dark:bg-card"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                  <SheetDescription>
                    Safawala Staff Portal navigation
                  </SheetDescription>
                </SheetHeader>
                <BrandMark className="px-2" />
                <BrandDivider />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <SidebarNavigation
                    modules={effectiveModules}
                    permissions={permissions}
                    departments={departments}
                    isMainId={isMainId}
                    portalKind={portalKind}
                  />
                </div>
                <div className="mt-4">
                  <AccountPanel name={name} departments={departments} portalKind={portalKind} />
                </div>
              </SheetContent>
            </Sheet>
            {pageHeader ? <div className="flex min-w-0 flex-1 items-center gap-2"><div className="flex min-w-0 flex-1 items-center">{pageHeader.backHref !== null ? <Link href={pageHeader.backHref ?? '/staff-portal'} aria-label="Back" className="pointer-events-auto mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted sm:mr-3"><ArrowLeft className="size-4" strokeWidth={3} /></Link> : null}<div className="min-w-0"><span className="block truncate text-base font-semibold leading-5">{pageHeader.title}</span><span className="hidden truncate text-[11px] text-muted-foreground sm:block">{pageHeader.subtitle}</span></div></div>{pageHeader.actions ? <div className="pointer-events-auto ml-auto flex max-w-[42vw] shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:max-w-[52vw] lg:max-w-none [&::-webkit-scrollbar]:hidden [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:shrink-0 [&_[data-slot=button]]:px-3 [&_[data-slot=button]]:text-sm">{pageHeader.actions}</div> : null}</div> : <div className="min-w-0 flex-1" />}
            <LanguageSelector />
            <Link
              href="/staff-portal/notifications"
              aria-label="Notifications"
              className="pointer-events-auto relative ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#dfd3c3] bg-[#fcfaf7] text-[#70481c] shadow-sm transition hover:bg-[#f5ead8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#3a2f22] dark:bg-[#241e17] dark:text-[#f0d9ad] dark:hover:bg-[#33291c] sm:ml-2"
            >
              <Bell aria-hidden="true" className="size-4" />
              {notificationCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              ) : null}
            </Link>
          </div>
        </header>
        <main className="w-full min-w-0 max-w-full overflow-x-clip bg-surface px-4 pb-5 pt-[5.25rem] sm:px-6 sm:pb-7 sm:pt-[5.75rem] lg:px-8">
          {children}
        </main>
      </div>
      <TeamChatWidget />
    </div></StaffLanguageProvider></DashboardHeaderContext.Provider>
  );
}
