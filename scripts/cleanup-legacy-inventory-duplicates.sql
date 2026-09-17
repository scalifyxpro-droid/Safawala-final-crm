-- One-time cleanup for confirmed legacy inventory duplicates and retail rows
-- that were imported into the active main inventory with zero quantity.
--
-- Keeps the authoritative SKU: SW1001 record:
--   legacy_id 5086f94b-964c-498f-a227-af79237bc39d (100 units)
-- Removes three unused duplicate records after backing them up.
-- Archives, but does not delete, zero-quantity retail_products rows.

begin;

select pg_advisory_xact_lock(hashtext('safawala_legacy_inventory_cleanup_20260918'));

lock table public.products in share row exclusive mode;
lock table public.legacy_inventory_product_map in share mode;
lock table public.booking_items in share mode;
lock table public.package_items in share mode;
lock table public.product_units in share mode;
lock table public.product_variants in share mode;

create table if not exists public.inventory_cleanup_backup_20260918 (
  cleanup_key text not null,
  owner_id uuid not null,
  product_id bigint not null,
  legacy_source text,
  legacy_id uuid,
  planned_action text not null,
  product_snapshot jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (cleanup_key, owner_id, product_id)
);

alter table public.inventory_cleanup_backup_20260918 enable row level security;
revoke all on table public.inventory_cleanup_backup_20260918 from anon, authenticated;

do $$
declare
  keeper_count integer;
  duplicate_count integer;
  retail_count integer;
  duplicate_reference_count integer;
begin
  select count(*) into keeper_count
  from public.products p
  join public.legacy_inventory_product_map m
    on m.owner_id = p.owner_id
   and m.product_id = p.id
   and m.source = 'products'
  where m.legacy_id = '5086f94b-964c-498f-a227-af79237bc39d'::uuid
    and lower(trim(p.name)) = 'sku: sw1001'
    and p.stock_quantity = 100
    and p.is_active;

  if keeper_count <> 1 then
    raise exception 'Expected exactly one active 100-unit SKU: SW1001 keeper, found %.', keeper_count;
  end if;

  select count(*) into duplicate_count
  from public.products p
  join public.legacy_inventory_product_map m
    on m.owner_id = p.owner_id
   and m.product_id = p.id
   and m.source = 'products'
  where m.legacy_id in (
    '620716ae-0a0f-4040-bc89-358bb3056664'::uuid,
    '39815078-6ea8-491a-ae21-0816e182b2b6'::uuid,
    '563f786a-0d18-4b22-b786-dc9e41819aa8'::uuid
  )
    and lower(trim(p.name)) = 'sku: sw1001';

  if duplicate_count <> 3 then
    raise exception 'Expected exactly three SKU: SW1001 duplicate records, found %.', duplicate_count;
  end if;

  select count(*) into duplicate_reference_count
  from public.products p
  join public.legacy_inventory_product_map m
    on m.owner_id = p.owner_id
   and m.product_id = p.id
   and m.source = 'products'
  where m.legacy_id in (
    '620716ae-0a0f-4040-bc89-358bb3056664'::uuid,
    '39815078-6ea8-491a-ae21-0816e182b2b6'::uuid,
    '563f786a-0d18-4b22-b786-dc9e41819aa8'::uuid
  )
    and (
      exists (select 1 from public.booking_items bi where bi.product_id = p.id)
      or exists (select 1 from public.package_items pi where pi.product_id = p.id)
      or exists (select 1 from public.product_units u where u.product_id = p.id)
      or exists (select 1 from public.product_variants v where v.product_id = p.id)
    );

  if duplicate_reference_count <> 0 then
    raise exception 'A duplicate product gained dependent records; cleanup was cancelled.';
  end if;

  select count(distinct p.id) into retail_count
  from public.products p
  join public.legacy_inventory_product_map m
    on m.owner_id = p.owner_id
   and m.product_id = p.id
   and m.source = 'retail_products'
  where p.is_active
    and p.stock_quantity = 0;

  if retail_count <> 89 then
    raise exception 'Expected 89 active zero-quantity retail products, found %.', retail_count;
  end if;

  insert into public.inventory_cleanup_backup_20260918 (
    cleanup_key,
    owner_id,
    product_id,
    legacy_source,
    legacy_id,
    planned_action,
    product_snapshot
  )
  select
    'legacy-inventory-cleanup-20260918',
    p.owner_id,
    p.id,
    m.source,
    m.legacy_id,
    'delete_duplicate',
    to_jsonb(p)
  from public.products p
  join public.legacy_inventory_product_map m
    on m.owner_id = p.owner_id
   and m.product_id = p.id
   and m.source = 'products'
  where m.legacy_id in (
    '620716ae-0a0f-4040-bc89-358bb3056664'::uuid,
    '39815078-6ea8-491a-ae21-0816e182b2b6'::uuid,
    '563f786a-0d18-4b22-b786-dc9e41819aa8'::uuid
  )
  on conflict (cleanup_key, owner_id, product_id) do nothing;

  insert into public.inventory_cleanup_backup_20260918 (
    cleanup_key,
    owner_id,
    product_id,
    legacy_source,
    legacy_id,
    planned_action,
    product_snapshot
  )
  select distinct on (p.owner_id, p.id)
    'legacy-inventory-cleanup-20260918',
    p.owner_id,
    p.id,
    m.source,
    m.legacy_id,
    'archive_zero_retail',
    to_jsonb(p)
  from public.products p
  join public.legacy_inventory_product_map m
    on m.owner_id = p.owner_id
   and m.product_id = p.id
   and m.source = 'retail_products'
  where p.is_active
    and p.stock_quantity = 0
  order by p.owner_id, p.id, m.legacy_id
  on conflict (cleanup_key, owner_id, product_id) do nothing;

  update public.products p
  set is_active = false,
      updated_at = now()
  where p.is_active
    and p.stock_quantity = 0
    and exists (
      select 1
      from public.legacy_inventory_product_map m
      where m.owner_id = p.owner_id
        and m.product_id = p.id
        and m.source = 'retail_products'
    );

  delete from public.products p
  using public.legacy_inventory_product_map m
  where m.owner_id = p.owner_id
    and m.product_id = p.id
    and m.source = 'products'
    and m.legacy_id in (
      '620716ae-0a0f-4040-bc89-358bb3056664'::uuid,
      '39815078-6ea8-491a-ae21-0816e182b2b6'::uuid,
      '563f786a-0d18-4b22-b786-dc9e41819aa8'::uuid
    );
end $$;

commit;

select
  (select count(*)
   from public.inventory_cleanup_backup_20260918
   where cleanup_key = 'legacy-inventory-cleanup-20260918'
     and planned_action = 'delete_duplicate') as duplicate_backups,
  (select count(*)
   from public.inventory_cleanup_backup_20260918
   where cleanup_key = 'legacy-inventory-cleanup-20260918'
     and planned_action = 'archive_zero_retail') as retail_backups,
  (select count(*)
   from public.products p
   join public.legacy_inventory_product_map m
     on m.owner_id = p.owner_id
    and m.product_id = p.id
    and m.source = 'retail_products'
   where p.is_active and p.stock_quantity = 0) as active_zero_retail_remaining,
  (select count(*)
   from public.products p
   where lower(trim(p.name)) = 'sku: sw1001') as sw1001_records_remaining,
  (select max(p.stock_quantity)
   from public.products p
   where lower(trim(p.name)) = 'sku: sw1001') as sw1001_kept_stock;
