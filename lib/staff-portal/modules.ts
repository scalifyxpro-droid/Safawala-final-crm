import type { StaffDepartment } from './constants';

export const STAFF_MODULES = [
  'booking_overview', 'quotations', 'leads', 'bookings', 'customers', 'event_jobs',
  'event_tracking', 'calendar', 'warehouse_tasks', 'qc_tasks', 'stylist_opportunities',
  'assigned_events', 'collection_tasks', 'modification_tasks', 'my_tasks', 'attendance',
  'performance', 'leave_management', 'agreements', 'invoices',
] as const;

export type StaffModule = (typeof STAFF_MODULES)[number];

export const STAFF_MODULE_META: Record<StaffModule, { label: string; description: string; href?: string }> = {
  booking_overview: { label: 'Booking overview', description: 'Booking department summary', href: '/staff-portal/booking' },
  quotations: { label: 'My Quotations', description: 'View and manage quotations', href: '/quotes' },
  leads: { label: 'My Leads', description: 'View assigned booking leads', href: '/staff-portal/leads' },
  bookings: { label: 'Bookings', description: 'Create and manage bookings', href: '/bookings' },
  customers: { label: 'Customers', description: 'View booking customer information', href: '/customers' },
  event_jobs: { label: 'Event Jobs', description: 'View Event Job progress', href: '/event-jobs' },
  event_tracking: { label: 'Event Tracking', description: 'Follow operational stages', href: '/staff-portal/event-tracking' },
  calendar: { label: 'Calendar', description: 'View the booking calendar', href: '/bookings/calendar' },
  warehouse_tasks: { label: 'Warehouse', description: 'Prepare and receive event items', href: '/staff-portal/warehouse' },
  qc_tasks: { label: 'QC & Packing', description: 'Perform quality and packing checks', href: '/staff-portal/qc' },
  stylist_opportunities: { label: 'Stylist Opportunities', description: 'View available event work', href: '/staff-portal/stylist' },
  assigned_events: { label: 'My Assigned Events', description: 'View approved stylist assignments', href: '/staff-portal/stylist/assigned' },
  collection_tasks: { label: 'Collection', description: 'Receive event items', href: '/staff-portal/collection' },
  modification_tasks: { label: 'Modifications', description: 'View alteration work', href: '/staff-portal/modifications' },
  my_tasks: { label: 'My Tasks', description: 'View assigned department work', href: '/staff-portal/tasks' },
  attendance: { label: 'My Attendance', description: 'Attendance access', href: '/staff-portal/attendance' },
  performance: { label: 'My Performance', description: 'View completed-event credit', href: '/staff-portal/performance' },
  leave_management: { label: 'Leave Management', description: 'Leave access', href: '/staff-portal/leave' },
  agreements: { label: 'My Agreements', description: 'Agreement access', href: '/staff-portal/agreements' },
  invoices: { label: 'My Invoices', description: 'Invoice access', href: '/staff-portal/invoices' },
};

export const DEPARTMENT_STAFF_MODULES: Record<StaffDepartment, readonly StaffModule[]> = {
  booking: ['booking_overview', 'quotations', 'leads', 'bookings', 'customers', 'event_jobs', 'event_tracking', 'calendar', 'my_tasks', 'attendance', 'performance', 'leave_management', 'agreements', 'invoices'],
  warehouse: ['warehouse_tasks', 'event_jobs', 'my_tasks', 'attendance', 'performance', 'leave_management'],
  qc: ['qc_tasks', 'event_jobs', 'my_tasks', 'attendance', 'performance', 'leave_management'],
  stylist: ['stylist_opportunities', 'assigned_events', 'my_tasks', 'attendance', 'performance', 'leave_management'],
  collection: ['collection_tasks', 'event_jobs', 'my_tasks', 'attendance', 'performance', 'leave_management'],
  modification: ['modification_tasks', 'event_jobs', 'my_tasks', 'attendance', 'performance', 'leave_management'],
};

export const MODULE_DEPARTMENT: Partial<Record<StaffModule, StaffDepartment>> = {
  booking_overview: 'booking', quotations: 'booking', leads: 'booking', bookings: 'booking', customers: 'booking',
  event_tracking: 'booking', calendar: 'booking', agreements: 'booking', invoices: 'booking',
  warehouse_tasks: 'warehouse', qc_tasks: 'qc', stylist_opportunities: 'stylist', assigned_events: 'stylist',
  collection_tasks: 'collection', modification_tasks: 'modification',
};
