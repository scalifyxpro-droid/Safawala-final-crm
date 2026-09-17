-- One-time, collision-checked backfill for products without a main barcode.
-- Codes are 11 numeric digits: 9 followed by the zero-padded product ID.
-- Existing barcodes are never replaced. The backup table supports reversal.
do $$
declare
  candidate_count integer;
  backed_up_count integer;
  updated_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('safawala_product_barcode_backfill'));
  lock table public.products in share row exclusive mode;
  lock table public.product_variants in share mode;
  lock table public.product_units in share mode;

  select count(*) into candidate_count
  from public.products
  where nullif(trim(barcode), '') is null;

  if exists (
    with candidates as (
      select id, '9' || lpad(id::text, 10, '0') as code
      from public.products
      where nullif(trim(barcode), '') is null
    )
    select 1 from candidates c
    where c.id < 0 or c.id > 9999999999
      or exists (select 1 from public.products p where p.barcode = c.code)
      or exists (select 1 from public.product_variants v where v.barcode = c.code)
      or exists (select 1 from public.product_units u where u.barcode = c.code)
  ) then
    raise exception 'Barcode candidates conflict with an existing code or exceed 11 digits.';
  end if;

  create table if not exists public.product_barcode_backfill_20260918 (
    owner_id uuid not null,
    product_id bigint not null,
    previous_barcode text,
    assigned_barcode text not null,
    backed_up_at timestamptz not null default now(),
    primary key (owner_id, product_id),
    unique (assigned_barcode)
  );
  alter table public.product_barcode_backfill_20260918 enable row level security;
  revoke all on table public.product_barcode_backfill_20260918 from anon, authenticated;

  insert into public.product_barcode_backfill_20260918
    (owner_id, product_id, previous_barcode, assigned_barcode)
  select owner_id, id, barcode, '9' || lpad(id::text, 10, '0')
  from public.products
  where nullif(trim(barcode), '') is null;
  get diagnostics backed_up_count = row_count;

  update public.products p
  set barcode = b.assigned_barcode, updated_at = now()
  from public.product_barcode_backfill_20260918 b
  where p.owner_id = b.owner_id
    and p.id = b.product_id
    and nullif(trim(p.barcode), '') is null;
  get diagnostics updated_count = row_count;

  if candidate_count <> backed_up_count or candidate_count <> updated_count then
    raise exception 'Barcode backfill count mismatch: candidates %, backup %, updated %',
      candidate_count, backed_up_count, updated_count;
  end if;
end $$;

select count(*) as barcodes_backed_up
from public.product_barcode_backfill_20260918;
