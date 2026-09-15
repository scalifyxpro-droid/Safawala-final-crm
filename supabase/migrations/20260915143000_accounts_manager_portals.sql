alter table public.staff_members
  add column if not exists portal_kind text not null default 'staff';

alter table public.staff_members
  drop constraint if exists staff_members_portal_kind_check;

alter table public.staff_members
  add constraint staff_members_portal_kind_check
  check (portal_kind in ('staff', 'accounts', 'manager'));

comment on column public.staff_members.portal_kind is
  'Role-specific staff portal landing and permission preset.';

alter table public.staff_access_modules
  drop constraint if exists staff_access_modules_module_check;

alter table public.staff_access_modules
  add constraint staff_access_modules_module_check check (module in (
    'dashboard', 'bookings', 'quotations', 'create_booking', 'calendar',
    'event_jobs', 'stylist_approvals', 'travel', 'performance',
    'modifications', 'inventory', 'packages', 'customers', 'ledger',
    'challans', 'vouchers', 'expenses', 'reports'
  ));

drop policy if exists challans_staff_access on public.challans;
create policy challans_staff_access on public.challans to authenticated
  using (owner_id = public.current_staff_owner() and public.staff_can_access('challans'))
  with check (owner_id = public.current_staff_owner() and public.staff_can_access('challans'));

drop policy if exists vouchers_staff_access on public.vouchers;
create policy vouchers_staff_access on public.vouchers to authenticated
  using (owner_id = public.current_staff_owner() and public.staff_can_access('vouchers'))
  with check (owner_id = public.current_staff_owner() and public.staff_can_access('vouchers'));

drop policy if exists expenses_staff_access on public.expenses;
create policy expenses_staff_access on public.expenses to authenticated
  using (owner_id = public.current_staff_owner() and public.staff_can_access('expenses'))
  with check (owner_id = public.current_staff_owner() and public.staff_can_access('expenses'));

drop policy if exists staff_members_reports_select on public.staff_members;
create policy staff_members_reports_select on public.staff_members for select to authenticated
  using (owner_id = public.current_staff_owner() and public.staff_can_access('reports'));
