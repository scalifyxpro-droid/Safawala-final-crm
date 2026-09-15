import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const preparedPath = join(
  projectDir,
  'migration',
  'legacy-inventory',
  'prepared-products.json',
);
const confirmed = process.env.CONFIRM_LEGACY_STOCK_RECONCILIATION === 'YES';

function fail(message) {
  throw new Error(message);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL is required.');

const prepared = JSON.parse(await readFile(preparedPath, 'utf8'));
if (!Array.isArray(prepared) || prepared.length !== 2316) {
  fail(`Expected 2316 prepared products, found ${prepared?.length ?? 'invalid data'}.`);
}

const desired = prepared.map((product) => {
  const stockQuantity = Number(product.stockQuantity);
  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
    fail(`Invalid stock quantity for legacy product ${product.legacyId}.`);
  }
  return {
    source: product.source === 'retail_products' ? 'retail_products' : 'products',
    legacy_id: product.legacyId,
    barcode: product.barcode || null,
    stock_quantity: stockQuantity,
  };
});

const sourceKeys = new Set(desired.map((row) => `${row.source}:${row.legacy_id}`));
if (sourceKeys.size !== desired.length) fail('Prepared stock source contains duplicate identities.');

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.PGSSLMODE === 'disable' ? false : 'require',
  connect_timeout: 20,
  idle_timeout: 10,
});

try {
  const report = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('safawala_legacy_stock_reconciliation'))`;
    await tx`
      create temporary table desired_legacy_stock (
        source text not null,
        legacy_id uuid not null,
        barcode text,
        stock_quantity integer not null check (stock_quantity >= 0),
        primary key (source, legacy_id)
      ) on commit drop
    `;
    await tx`
      insert into desired_legacy_stock (source, legacy_id, barcode, stock_quantity)
      select source, legacy_id, barcode, stock_quantity
      from jsonb_to_recordset(${tx.json(desired)}::jsonb)
        as row(source text, legacy_id uuid, barcode text, stock_quantity integer)
    `;

    const [audit] = await tx`
      select
        count(*)::integer as mapped_products,
        count(*) filter (where product.id is null)::integer as missing_products,
        count(*) filter (
          where product.id is not null
            and product.barcode is distinct from desired.barcode
        )::integer as barcode_mismatches,
        count(*) filter (
          where product.id is not null
            and product.stock_quantity is distinct from desired.stock_quantity
        )::integer as stock_changes
      from desired_legacy_stock desired
      left join public.legacy_inventory_product_map mapping
        on mapping.source = desired.source
       and mapping.legacy_id = desired.legacy_id
      left join public.products product
        on product.owner_id = mapping.owner_id
       and product.id = mapping.product_id
    `;

    if (audit.mapped_products !== desired.length || audit.missing_products !== 0) {
      fail(`Product mapping audit failed: ${JSON.stringify(audit)}.`);
    }
    if (audit.barcode_mismatches !== 0) {
      fail(`Barcode safety audit failed: ${audit.barcode_mismatches} mismatch(es).`);
    }

    const [before] = await tx`
      select
        count(*) filter (where product.is_active and product.stock_quantity = 0)::integer as active_out_of_stock,
        coalesce(sum(product.stock_quantity), 0)::bigint as total_stock
      from public.products product
      where exists (
        select 1 from public.legacy_inventory_product_map mapping
        where mapping.owner_id = product.owner_id and mapping.product_id = product.id
      )
    `;

    if (!confirmed) {
      const [expected] = await tx`
        select
          count(*) filter (where product.is_active and desired.stock_quantity = 0)::integer as active_out_of_stock,
          coalesce(sum(desired.stock_quantity), 0)::bigint as total_stock
        from desired_legacy_stock desired
        join public.legacy_inventory_product_map mapping
          on mapping.source = desired.source and mapping.legacy_id = desired.legacy_id
        join public.products product
          on product.owner_id = mapping.owner_id and product.id = mapping.product_id
      `;
      return { mode: 'dry-run', audit, before, expected };
    }

    await tx`
      create table if not exists public.legacy_stock_reconciliation_backup_20260915 (
        owner_id uuid not null,
        product_id bigint not null,
        previous_stock_quantity integer not null,
        corrected_stock_quantity integer not null,
        barcode text,
        backed_up_at timestamptz not null default now(),
        primary key (owner_id, product_id)
      )
    `;
    await tx`alter table public.legacy_stock_reconciliation_backup_20260915 enable row level security`;
    await tx`revoke all on table public.legacy_stock_reconciliation_backup_20260915 from anon, authenticated`;
    await tx`
      insert into public.legacy_stock_reconciliation_backup_20260915 (
        owner_id, product_id, previous_stock_quantity, corrected_stock_quantity, barcode
      )
      select
        product.owner_id,
        product.id,
        product.stock_quantity,
        desired.stock_quantity,
        product.barcode
      from desired_legacy_stock desired
      join public.legacy_inventory_product_map mapping
        on mapping.source = desired.source and mapping.legacy_id = desired.legacy_id
      join public.products product
        on product.owner_id = mapping.owner_id and product.id = mapping.product_id
      where product.stock_quantity is distinct from desired.stock_quantity
      on conflict (owner_id, product_id) do nothing
    `;
    const updated = await tx`
      update public.products product
      set stock_quantity = desired.stock_quantity, updated_at = now()
      from desired_legacy_stock desired
      join public.legacy_inventory_product_map mapping
        on mapping.source = desired.source and mapping.legacy_id = desired.legacy_id
      where product.owner_id = mapping.owner_id
        and product.id = mapping.product_id
        and product.stock_quantity is distinct from desired.stock_quantity
      returning product.id
    `;

    const [after] = await tx`
      select
        count(*) filter (where product.is_active and product.stock_quantity = 0)::integer as active_out_of_stock,
        coalesce(sum(product.stock_quantity), 0)::bigint as total_stock,
        count(*) filter (
          where product.stock_quantity is distinct from desired.stock_quantity
        )::integer as remaining_stock_mismatches,
        count(*) filter (
          where product.barcode is distinct from desired.barcode
        )::integer as barcode_mismatches
      from desired_legacy_stock desired
      join public.legacy_inventory_product_map mapping
        on mapping.source = desired.source and mapping.legacy_id = desired.legacy_id
      join public.products product
        on product.owner_id = mapping.owner_id and product.id = mapping.product_id
    `;
    if (after.remaining_stock_mismatches !== 0 || after.barcode_mismatches !== 0) {
      fail(`Post-update verification failed: ${JSON.stringify(after)}.`);
    }
    return { mode: 'applied', audit, rowsUpdated: updated.length, before, after };
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
