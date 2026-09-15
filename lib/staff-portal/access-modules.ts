// Edge-safe access catalogue shared by middleware and the staff portal.
export const ACCESS_MODULES = [
  'dashboard',
  'bookings',
  'quotations',
  'create_booking',
  'calendar',
  'event_jobs',
  'stylist_approvals',
  'travel',
  'performance',
  'modifications',
  'inventory',
  'packages',
  'customers',
  'ledger',
  'challans',
  'vouchers',
  'expenses',
  'reports',
] as const;

export type AccessModule = (typeof ACCESS_MODULES)[number];

export const ACCOUNTS_PORTAL_MODULES: AccessModule[] = [
  'bookings',
  'quotations',
  'customers',
  'ledger',
  'challans',
  'vouchers',
  'expenses',
];

// The role-specific portal home is the manager dashboard; the admin dashboard
// remains excluded because it contains owner-only configuration widgets.
export const MANAGER_PORTAL_MODULES: AccessModule[] = ACCESS_MODULES.filter(
  (module) => module !== 'dashboard',
);

export const ACCESS_MODULE_META: Record<
  AccessModule,
  { label: string; description: string; href: string }
> = {
  dashboard: { label: 'Dashboard', description: 'Business overview', href: '/dashboard' },
  bookings: { label: 'All bookings', description: 'View and manage bookings', href: '/bookings' },
  quotations: { label: 'Quotes', description: 'Create and manage quotations', href: '/quotes' },
  create_booking: { label: 'Create booking', description: 'Create an order or quotation', href: '/bookings/new' },
  calendar: { label: 'Calendar', description: 'View the booking calendar', href: '/bookings/calendar' },
  event_jobs: { label: 'Event Jobs', description: 'Track event operations', href: '/event-jobs' },
  stylist_approvals: { label: 'Stylist Approvals', description: 'Approve rental stylists', href: '/stylist-approvals' },
  travel: { label: 'Travel Manager', description: 'Manage rental-event travel', href: '/travel' },
  performance: { label: 'Performance', description: 'View staff performance', href: '/performance' },
  modifications: { label: 'Modifications', description: 'Manage alteration work', href: '/modifications' },
  inventory: { label: 'Inventory', description: 'View and manage products', href: '/inventory' },
  packages: { label: 'Package Manager', description: 'View and manage packages', href: '/packages' },
  customers: { label: 'Customers', description: 'View customer information', href: '/customers' },
  ledger: { label: 'Customer ledger', description: 'View customer accounts', href: '/ledger' },
  challans: { label: 'Challans', description: 'Manage delivery and account challans', href: '/challans' },
  vouchers: { label: 'Vouchers', description: 'Record receipts and payments', href: '/vouchers' },
  expenses: { label: 'Expenses', description: 'Record and review business expenses', href: '/expenses' },
  reports: { label: 'Reports', description: 'Review business and finance reports', href: '/reports' },
};

export function accessModuleForPath(path: string): AccessModule | null {
  if (path === '/dashboard') return 'dashboard';
  if (path === '/quotes' || path.startsWith('/quotes/')) return 'quotations';
  if (path === '/bookings/new') return 'create_booking';
  if (path === '/bookings/calendar') return 'calendar';
  if (path === '/bookings' || path.startsWith('/bookings/')) return 'bookings';
  if (path === '/event-jobs' || path.startsWith('/event-jobs/')) return 'event_jobs';
  if (path.startsWith('/stylist-approvals')) return 'stylist_approvals';
  if (path.startsWith('/travel')) return 'travel';
  if (path.startsWith('/performance')) return 'performance';
  if (path.startsWith('/modifications')) return 'modifications';
  if (path.startsWith('/inventory')) return 'inventory';
  if (path.startsWith('/packages')) return 'packages';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/ledger')) return 'ledger';
  if (path.startsWith('/challans')) return 'challans';
  if (path.startsWith('/vouchers')) return 'vouchers';
  if (path.startsWith('/expenses')) return 'expenses';
  if (path.startsWith('/reports')) return 'reports';
  return null;
}
