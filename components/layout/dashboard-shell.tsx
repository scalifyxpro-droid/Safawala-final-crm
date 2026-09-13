'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
import {
  DashboardHeaderContext,
  type PageHeader,
} from '@/components/layout/dashboard-header-context';
import { AdminNotificationPopover } from '@/components/layout/admin-notification-popover';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { adminLogoutAction } from '@/lib/auth/logout-action';
import {
  Archive,
  BarChart3,
  CircleDollarSign,
  Boxes,
  ArrowLeft,
  CalendarDays,
  ChevronUp,
  ClipboardList,
  ContactRound,
  FileText,
  Landmark,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  PlaneTakeoff,
  Plus,
  Route,
  ReceiptText,
  Settings,
  Trophy,
  UserCheck,
  Wrench,
  UserCog,
  WalletCards,
  Tag,
  Truck,
  WashingMachine,
} from 'lucide-react';

function SidebarNavigation() {
  const pathname = usePathname();
  const groups = [
    {
      label: 'Overview',
      links: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/bookings/new', label: 'Create Booking', icon: Plus },
      ],
    },
    {
      label: 'Bookings & Sales',
      links: [
        { href: '/bookings', label: 'All Bookings', icon: ClipboardList },
        { href: '/bookings/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/quotes', label: 'Quotes', icon: FileText },
        { href: '/modifications', label: 'Modifications', icon: Wrench },
        { href: '/coupons', label: 'Coupons & Offers', icon: Tag },
      ],
    },
    {
      label: 'Customers',
      links: [
        { href: '/customers', label: 'Customers', icon: ContactRound },
        { href: '/leads', label: 'Leads', icon: UserCheck },
        { href: '/ledger', label: 'Customer Ledger', icon: Landmark },
      ],
    },
    {
      label: 'Operations',
      links: [
        {
          href: '/stylist-approvals',
          label: 'Stylist Approvals',
          icon: UserCheck,
        },
        { href: '/travel', label: 'Travel Manager', icon: PlaneTakeoff },
        { href: '/event-tracking', label: 'Job Tracking', icon: Route },
        { href: '/inventory', label: 'Inventory', icon: Boxes },
        { href: '/inventory/archive', label: 'Product Archive', icon: Archive },
        { href: '/packages', label: 'Package Manager', icon: Layers3 },
        { href: '/vendors', label: 'Vendors', icon: Truck },
        { href: '/laundry', label: 'Laundry', icon: WashingMachine },
      ],
    },
    {
      label: 'Finance & Operations',
      links: [
        { href: '/challans', label: 'Challans', icon: ReceiptText },
        { href: '/vouchers', label: 'Vouchers', icon: WalletCards },
        { href: '/expenses', label: 'Expenses', icon: CircleDollarSign },
        { href: '/reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Team & HR',
      links: [
        { href: '/performance', label: 'Performance', icon: Trophy },
        { href: '/hr', label: 'HR & Staff', icon: UserCog },
      ],
    },
    {
      label: 'System',
      links: [{ href: '/settings', label: 'Settings', icon: Settings }],
    },
  ];
  return (
    <nav aria-label="Primary navigation" className="mt-8 space-y-1">
      {groups.map((group) => (
        <div key={group.label} className="pt-4 first:pt-0">
          <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.links.map(({ href, label, icon: Icon }) => {
              const active =
                href === '/inventory'
                  ? pathname === '/inventory'
                  : href === '/dashboard' || href === '/bookings'
                    ? pathname === href
                    : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-10 items-center gap-2.5 rounded-lg border px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-[#e4d2b6] bg-[#f5ead8] font-semibold text-[#70481c]' : 'border-transparent text-muted-foreground hover:bg-[#f7f4ef] hover:text-foreground'}`}
                >
                  <span
                    className={`grid size-7 place-items-center rounded-md ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AccountPanel({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const initials = email.slice(0, 2).toUpperCase();

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
            Safawala Admin
          </strong>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {email}
          </span>
        </span>
        <ChevronUp
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted-foreground transition ${open ? '' : 'rotate-180'}`}
        />
      </button>
      {open ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => adminLogoutAction()}
          className="mt-1 h-9 w-full justify-start px-3 text-muted-foreground hover:bg-red-50 hover:text-destructive dark:hover:bg-destructive/15"
          aria-label="Log out of Safawala CRM"
        >
          <LogOut aria-hidden="true" />
          <span>Log out</span>
        </Button>
      ) : null}
    </div>
  );
}

function BrandDivider() {
  return (
    <div
      aria-hidden="true"
      className="mt-5 h-px bg-[#cec5b9] dark:bg-[#332b21]"
    />
  );
}

export function DashboardShell({
  email,
  children,
  notificationCount: _notificationCount = 0,
}: {
  email: string;
  children: ReactNode;
  notificationCount?: number;
}) {
  const pathname = usePathname();
  const fallbackHeader = (path: string): PageHeader => {
    if (path.startsWith('/bookings'))
      return {
        title: path === '/bookings' ? 'All bookings' : 'Bookings',
        subtitle: 'Sales, rentals, payments and events',
        backHref: path === '/bookings' ? undefined : '/bookings',
      };
    if (path.startsWith('/leads'))
      return {
        title: 'Leads Center',
        subtitle:
          'Track package enquiries, manage manual leads, and follow up.',
        backHref: '/dashboard',
      };
    if (path.startsWith('/customers'))
      return {
        title: 'Customers',
        subtitle: 'Customer details, booking history and outstanding balances',
      };
    if (path.startsWith('/ledger'))
      return {
        title: 'Customer Ledger',
        subtitle: 'Customer-wise billing, receipts and outstanding balances',
      };
    if (path.startsWith('/notifications'))
      return {
        title: 'Notifications',
        subtitle: 'Updates about leads, locked dates and your account',
        backHref: '/dashboard',
      };
    if (path.startsWith('/inventory'))
      return {
        title: 'Inventory',
        subtitle: 'Products, pricing, stock and barcodes',
      };
    if (path.startsWith('/packages'))
      return {
        title: 'Package Manager',
        subtitle: 'Category-based package system',
      };
    if (path.startsWith('/coupons'))
      return {
        title: 'Manage Offers',
        subtitle: 'Create, edit, and manage discount codes for bookings',
        backHref: '/dashboard',
      };
    if (path.startsWith('/reports'))
      return {
        title: 'Business Reports',
        subtitle: 'Revenue, bookings, inventory and payment insights',
        backHref: '/dashboard',
      };
    if (path.startsWith('/challans'))
      return {
        title: 'Delivery Challans',
        subtitle: 'Create and track delivery receipts and pickup sheets',
        backHref: '/dashboard',
      };
    if (path.startsWith('/vouchers'))
      return {
        title: 'Payment & Receipt Vouchers',
        subtitle: 'Track customer receipts and company payments',
        backHref: '/dashboard',
      };
    if (path.startsWith('/expenses'))
      return {
        title: 'Expenses',
        subtitle: 'Track and manage business expenses',
        backHref: '/dashboard',
      };
    if (path.startsWith('/vendors'))
      return {
        title: 'Vendor Management',
        subtitle: 'Suppliers, contacts and vendor records for your business',
        backHref: '/dashboard',
      };
    if (path.startsWith('/staff'))
      return { title: 'Staff', subtitle: 'Manage staff accounts and access' };
    if (path.startsWith('/settings'))
      return { title: 'Settings', subtitle: 'Manage your CRM preferences' };
    return path === '/dashboard'
      ? {
          title: 'Booking Dashboard',
          subtitle: 'Bookings, quotations and jobs waiting for closure',
        }
      : null;
  };
  const [pageHeader, setPageHeader] = useState<PageHeader>(() =>
    fallbackHeader(pathname),
  );
  useLayoutEffect(() => setPageHeader(fallbackHeader(pathname)), [pathname]);

  return (
    <DashboardHeaderContext.Provider value={setPageHeader}>
      <div className="min-h-dvh bg-surface text-foreground">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white dark:bg-card px-4 py-6 dark:bg-card lg:flex">
          <BrandMark className="px-2" />
          <BrandDivider />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNavigation />
          </div>
          <div className="mt-4">
            <AccountPanel email={email} />
            <p className="mt-3 text-center text-[10px] text-muted-foreground">
              Safawala CRM · Version 1.0
            </p>
          </div>
        </aside>

        <div className="lg:pl-64">
          <header className="pointer-events-none sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-y-1 border-b border-border bg-white px-4 py-1 dark:bg-card sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Sheet>
                <SheetTrigger
                  aria-label="Open navigation"
                  className="pointer-events-auto fixed left-4 top-3 z-40 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-white text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card lg:hidden"
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
                      Safawala CRM primary navigation
                    </SheetDescription>
                  </SheetHeader>
                  <BrandMark className="px-2" />
                  <BrandDivider />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <SidebarNavigation />
                  </div>
                  <div className="mt-4">
                    <AccountPanel email={email} />
                  </div>
                </SheetContent>
              </Sheet>
              {pageHeader ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pl-12 lg:pl-0">
                  <div className="flex min-w-0 flex-1 basis-[220px] items-center">
                    {pageHeader.backHref ? (
                      <Link
                        href={pageHeader.backHref}
                        className="pointer-events-auto mr-3 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                        aria-label="Back"
                      >
                        <ArrowLeft
                          aria-hidden="true"
                          className="size-4"
                          strokeWidth={3}
                        />
                      </Link>
                    ) : null}
                    <span className="min-w-0 align-middle">
                      <span className="block truncate text-base font-semibold leading-5">
                        {pageHeader.title}
                      </span>
                      <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                        {pageHeader.subtitle}
                      </span>
                    </span>
                  </div>
                  {pageHeader.actions ? (
                    <div className="pointer-events-auto ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:px-3 [&_[data-slot=button]]:text-sm">
                      {pageHeader.actions}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <div className="pointer-events-auto flex items-center gap-2">
                <AdminNotificationPopover />
              </div>
            </div>
          </header>
          <main className="bg-surface px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </DashboardHeaderContext.Provider>
  );
}
