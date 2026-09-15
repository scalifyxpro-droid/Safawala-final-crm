alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists employee_id text;
alter table public.profiles add column if not exists date_of_joining date;
alter table public.profiles add column if not exists emergency_contact_name text;
alter table public.profiles add column if not exists emergency_contact_phone text;
alter table public.profiles add column if not exists language_preference text not null default 'en';

create unique index if not exists profiles_employee_id_unique
  on public.profiles (upper(employee_id)) where employee_id is not null;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null check (char_length(bank_name) between 2 and 100),
  account_holder_name text not null check (char_length(account_holder_name) between 2 and 120),
  account_number text not null check (account_number ~ '^[0-9]{6,20}$'),
  ifsc_code text not null check (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  branch_name text,
  upi_id text,
  qr_code_image text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, account_number)
);

create unique index if not exists bank_accounts_one_primary_per_owner
  on public.bank_accounts (owner_id) where is_primary;
create index if not exists bank_accounts_owner_created_idx
  on public.bank_accounts (owner_id, created_at desc);

alter table public.bank_accounts enable row level security;

drop policy if exists bank_accounts_select_authorized on public.bank_accounts;
create policy bank_accounts_select_authorized
  on public.bank_accounts for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      owner_id = public.current_staff_owner()
      and public.staff_can_access('bookings')
    )
  );

drop policy if exists bank_accounts_insert_owner on public.bank_accounts;
create policy bank_accounts_insert_owner
  on public.bank_accounts for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists bank_accounts_update_owner on public.bank_accounts;
create policy bank_accounts_update_owner
  on public.bank_accounts for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists bank_accounts_delete_owner on public.bank_accounts;
create policy bank_accounts_delete_owner
  on public.bank_accounts for delete to authenticated
  using (owner_id = (select auth.uid()));

drop trigger if exists bank_accounts_set_updated_at on public.bank_accounts;
create trigger bank_accounts_set_updated_at
before update on public.bank_accounts
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.bank_accounts to authenticated;

-- Preserve the payment account that existing invoice PDFs already use. This
-- gives each existing administrator an immediately editable primary account,
-- while new accounts can still be added normally from Settings.
insert into public.bank_accounts (
  owner_id, bank_name, account_holder_name, account_number, ifsc_code,
  branch_name, upi_id, is_primary
)
select p.id, 'ICICI Bank', 'Mr. Ronak Dave', '187501504458', 'ICIC0001396',
  'Vadodara', '7020926385@okbizaxis', true
from public.profiles p
where p.role = 'admin'
  and not exists (
    select 1 from public.bank_accounts ba where ba.owner_id = p.id
  );
