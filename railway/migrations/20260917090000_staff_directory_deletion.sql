-- A deleted staff ID must no longer be usable or appear in the live directory,
-- while its booking and HR references remain intact for historical records.
alter table public.staff_members
  add column if not exists deleted_at timestamptz;

-- Let a new staff ID reuse a deleted member's name without allowing duplicate
-- names in the live directory.
alter table public.staff_members
  drop constraint if exists staff_members_owner_id_name_key;
create unique index if not exists staff_members_owner_live_name_key
  on public.staff_members (owner_id, name)
  where deleted_at is null;

comment on column public.staff_members.deleted_at is
  'Portal login removed and staff ID hidden from the active directory; historical references are retained.';
