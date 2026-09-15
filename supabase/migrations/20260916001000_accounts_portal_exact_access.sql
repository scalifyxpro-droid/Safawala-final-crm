alter table public.staff_access_modules
  drop constraint if exists staff_access_modules_module_check;

alter table public.staff_access_modules
  add constraint staff_access_modules_module_check check (module in (
    'dashboard', 'bookings', 'quotations', 'create_booking', 'calendar',
    'event_jobs', 'stylist_approvals', 'travel', 'performance',
    'modifications', 'inventory', 'packages', 'customers', 'vendors',
    'ledger', 'challans', 'vouchers', 'expenses', 'reports'
  ));

drop policy if exists vendors_staff_select on public.vendors;
create policy vendors_staff_select on public.vendors for select to authenticated
  using (
    owner_id = public.current_staff_owner()
    and public.staff_can_access('vendors')
  );

-- Accounts Portal vendor access is deliberately read-only. Owner/admin
-- policies continue to control all vendor writes.
drop policy if exists vendors_staff_insert on public.vendors;
drop policy if exists vendors_staff_update on public.vendors;
drop policy if exists vendors_staff_delete on public.vendors;

-- Keep every existing Accounts Portal account aligned with the exact CA
-- module set. This is idempotent and does not affect regular/manager logins.
delete from public.staff_access_modules sam
using public.staff_members sm
where sam.staff_id = sm.id
  and sm.portal_kind = 'accounts'
  and sam.module not in (
    'bookings', 'customers', 'vendors', 'ledger',
    'challans', 'vouchers', 'expenses', 'reports'
  );

delete from public.staff_departments sd
using public.staff_members sm
where sd.staff_id = sm.id
  and sm.portal_kind = 'accounts';

insert into public.staff_access_modules (owner_id, staff_id, module, enabled)
select sm.owner_id, sm.id, module, true
from public.staff_members sm
cross join unnest(array[
  'bookings', 'customers', 'vendors', 'ledger',
  'challans', 'vouchers', 'expenses', 'reports'
]) as module
where sm.portal_kind = 'accounts'
on conflict (staff_id, module) do update set enabled = true;
