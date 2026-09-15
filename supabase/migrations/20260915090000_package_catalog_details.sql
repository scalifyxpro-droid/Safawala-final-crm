-- Store the package metadata supplied in safawala_package_variants.xlsx.
-- Catalogue rows are populated by the application on the administrator's
-- first Package Manager visit so the correct tenant owner_id is always used.

alter table public.package_variants
  add column if not exists safa_quantity integer,
  add column if not exists package_number integer,
  add column if not exists description text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'package_variants_safa_quantity_check'
  ) then
    alter table public.package_variants
      add constraint package_variants_safa_quantity_check
      check (safa_quantity is null or safa_quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'package_variants_package_number_check'
  ) then
    alter table public.package_variants
      add constraint package_variants_package_number_check
      check (package_number is null or package_number > 0);
  end if;
end $$;

create unique index if not exists package_variants_category_number_unique
  on public.package_variants (category_id, package_number)
  where package_number is not null;

create table if not exists public.package_catalog_imports (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  imported_at timestamptz not null default now()
);

alter table public.package_catalog_imports enable row level security;

drop policy if exists package_catalog_imports_select_own on public.package_catalog_imports;
create policy package_catalog_imports_select_own
  on public.package_catalog_imports for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists package_catalog_imports_insert_own on public.package_catalog_imports;
create policy package_catalog_imports_insert_own
  on public.package_catalog_imports for insert to authenticated
  with check ((select auth.uid()) = owner_id);

revoke all on public.package_catalog_imports from anon;
grant select, insert on public.package_catalog_imports to authenticated;

create or replace function public.ensure_safawala_package_catalog(target_owner uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = target_owner and role = 'admin'
  ) then
    raise exception 'Only an administrator can load the package catalogue';
  end if;

  if exists (
    select 1 from public.package_catalog_imports where owner_id = target_owner
  ) then
    return;
  end if;

  insert into public.package_categories (owner_id, name, is_active)
  select target_owner, quantity || ' Safas', true
  from unnest(array[21,31,41,51,61,71,81,91,101]) as quantity
  on conflict (owner_id, lower(trim(name)))
  do update set is_active = true;

  with quantity_prices(quantity, prices) as (
    values
      (21,  array[4000,5000,6000,7000,8000,9000,10000,11000,12000]::numeric[]),
      (31,  array[5000,6200,7500,9000,10500,12000,13500,15000,16500]::numeric[]),
      (41,  array[6000,7400,9000,11000,13000,15000,17000,19000,21000]::numeric[]),
      (51,  array[7000,8600,10500,13000,15500,18000,20500,23000,25500]::numeric[]),
      (61,  array[8000,9800,12000,15000,18000,21000,24000,27000,30000]::numeric[]),
      (71,  array[9000,11000,13500,17000,20500,24000,27500,31000,34500]::numeric[]),
      (81,  array[10000,12200,15000,19000,23000,27000,31000,35000,39000]::numeric[]),
      (91,  array[11000,13400,16500,21000,25500,30000,34500,39000,43500]::numeric[]),
      (101, array[12000,14600,18000,23000,28000,33000,36500,40000,43500]::numeric[])
  ),
  package_styles(package_number, name, inclusions, extra_safa_price, missing_safa_penalty) as (
    values
      (1, 'Package 1: Classic Style',
        array['Classic Style','3 VIP Family Safas','Groom Safa not included']::text[], 100, 450),
      (2, 'Package 2: Rajputana Rajwada Styles',
        array['Rajputana Rajwada Styles','6 VIP Family Safas + 1 Groom Designer Safa']::text[], 120, 500),
      (3, 'Package 3: Floral Design',
        array['Floral Design','10 VIP + 1 Groom Safa with premium accessories']::text[], 150, 550),
      (4, 'Package 4: Bollywood Styles',
        array['Bollywood Styles','All VIP Safas','Groom Maharaja Safa with premium brooches & jewellery']::text[], 200, 650),
      (5, 'Package 5: Adani''s Wedding Safa',
        array['Adani''s Wedding Safa','5 VVIP Family Safas','Premium Groom Safa with exclusive jewellery']::text[], 250, 700),
      (6, 'Package 6: Ram–Sita Wedding Shades',
        array['Ram–Sita Wedding Shades','5 VVIP Family Safas','Premium Groom Safa with exclusive jewellery']::text[], 300, 750),
      (7, 'Package 7: JJ Valaya Premium Silk (Lightweight)',
        array['JJ Valaya Premium Silk (Lightweight)','All VIP + Brooch for all + Groom Safa']::text[], 350, 950),
      (8, 'Package 8: Tissue Silk Premium (Lightweight)',
        array['Tissue Silk Premium (Lightweight)','All VIP + Brooch or Lace + Groom Safa']::text[], 400, 1050),
      (9, 'Package 9: Royal Heritage Special',
        array['Royal Heritage Special','All VVIP Theme Safas','Groom Safa with premium jewellery']::text[], 450, 1150)
  ),
  catalog as (
    select
      quantity_prices.quantity,
      package_styles.package_number,
      package_styles.name,
      quantity_prices.prices[package_styles.package_number] as base_price,
      package_styles.inclusions,
      package_styles.extra_safa_price,
      package_styles.missing_safa_penalty,
      case when quantity_prices.quantity >= 101 then 10000 else 5000 end as security_deposit
    from quantity_prices cross join package_styles
  )
  insert into public.package_variants (
    owner_id, category_id, safa_quantity, package_number, name, description,
    base_price, inclusions, extra_safa_price, missing_safa_penalty,
    security_deposit
  )
  select
    target_owner, category.id, catalog.quantity, catalog.package_number,
    catalog.name, null, catalog.base_price, catalog.inclusions,
    catalog.extra_safa_price, catalog.missing_safa_penalty,
    catalog.security_deposit
  from catalog
  join public.package_categories category
    on category.owner_id = target_owner
   and lower(trim(category.name)) = lower(catalog.quantity || ' Safas')
  on conflict (category_id, lower(trim(name)))
  do update set
    safa_quantity = excluded.safa_quantity,
    package_number = excluded.package_number,
    base_price = excluded.base_price,
    inclusions = excluded.inclusions,
    extra_safa_price = excluded.extra_safa_price,
    missing_safa_penalty = excluded.missing_safa_penalty,
    security_deposit = excluded.security_deposit,
    updated_at = now();

  insert into public.package_catalog_imports (owner_id)
  values (target_owner)
  on conflict (owner_id) do nothing;
end;
$$;

revoke all on function public.ensure_safawala_package_catalog(uuid) from public;
grant execute on function public.ensure_safawala_package_catalog(uuid) to authenticated;

do $$
declare
  admin_id uuid;
begin
  for admin_id in
    select id from public.profiles where role = 'admin'
  loop
    perform public.ensure_safawala_package_catalog(admin_id);
  end loop;
end $$;
