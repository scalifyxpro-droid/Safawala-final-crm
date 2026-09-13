import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { parse } from 'csv-parse/sync';
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const preparedDir = join(projectDir, 'migration', 'legacy-inventory');
const imageDir = join(preparedDir, 'images');
const csvDir = resolve(process.env.LEGACY_CSV_DIR || join(projectDir, '..'));
const command = process.argv[2] || 'audit';
const adminEmail = (process.env.MIGRATION_ADMIN_EMAIL || 'vadodara@safawala.com').trim().toLowerCase();
const confirmation = process.env.CONFIRM_PRODUCTION_INVENTORY_IMPORT === 'YES';
const publicImagePrefix = '/api/files/product-images/legacy-inventory/';
const expected = { preparedProducts: 2316, legacyProducts: 2227, retailProducts: 89, variants: 27, units: 949, categories: 25, archives: 52, imageEntries: 1992, validImages: 1991, validImageBytes: 2059241696 };
const broken = { legacyId: '85d908ec-6899-477a-87e7-628312804e43', barcode: 'VAR-53290214', url: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=200&h=200&fit=crop' };

const csvFiles = {
  products: 'products_rows.csv', images: 'product_images_rows.csv', barcodes: 'product_barcodes_rows.csv',
  items: 'product_items_rows.csv', variants: 'product_variations_rows.csv', categories: 'product_categories_rows.csv',
  retail: 'retail_products_rows.csv', archives: 'product_archive_rows.csv', franchises: 'franchises_rows.csv',
};

function fail(message) { throw new Error(message); }
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function csv(name) { return parse(readFileSync(join(csvDir, csvFiles[name]), 'utf8'), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: false }); }
function nullable(value) { const v = value == null ? '' : String(value).trim(); return v === '' ? null : v; }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function integer(value, fallback = 0) { return Math.max(0, Math.trunc(number(value, fallback))); }
function bool(value, fallback = true) { if (value == null || value === '') return fallback; return String(value).toLowerCase() === 'true'; }
function sha256File(path) { return new Promise((resolveHash, reject) => { const hash = createHash('sha256'); const stream = createReadStream(path); stream.on('error', reject); stream.on('data', (chunk) => hash.update(chunk)); stream.on('end', () => resolveHash(hash.digest('hex'))); }); }
function loadSources() {
  const prepared = json(join(preparedDir, 'prepared-products.json'));
  const manifest = json(join(preparedDir, 'image-manifest.json'));
  const legacyMap = json(join(preparedDir, 'legacy-product-map.json'));
  const rows = Object.fromEntries(Object.keys(csvFiles).map((name) => [name, csv(name)]));
  return { prepared, manifest, legacyMap, rows };
}

function assertSourceShape(source) {
  const { prepared, manifest, legacyMap, rows } = source;
  const counts = {
    preparedProducts: prepared.length,
    legacyProducts: prepared.filter((p) => !p.source).length,
    retailProducts: prepared.filter((p) => p.source === 'retail_products').length,
    variants: rows.variants.length,
    units: rows.barcodes.length + rows.items.length,
    categories: rows.categories.length,
    archives: rows.archives.length,
    imageEntries: manifest.length,
    validImages: manifest.filter((x) => x.status === 'downloaded').length,
    validImageBytes: manifest.filter((x) => x.status === 'downloaded').reduce((sum, x) => sum + number(x.bytes), 0),
  };
  for (const [key, value] of Object.entries(expected)) if (counts[key] !== value) fail(`Source count mismatch for ${key}: expected ${value}, found ${counts[key]}`);
  if (Object.keys(legacyMap).length !== 2303) fail(`Legacy map must have 2303 entries, found ${Object.keys(legacyMap).length}`);
  const failed = manifest.filter((x) => x.status !== 'downloaded');
  if (failed.length !== 1 || failed[0].legacyId !== broken.legacyId || failed[0].url !== broken.url) fail('The image failure set differs from the one explicitly approved broken Golden Zari image.');
  const brokenVariant = rows.variants.find((row) => row.id === broken.legacyId);
  if (!brokenVariant || brokenVariant.barcode !== broken.barcode || brokenVariant.image_url !== broken.url) fail('The approved broken Golden Zari variant does not match its expected ID, barcode, and URL.');
  const validBarcode = /^[A-Za-z0-9_-]{1,50}$/;
  for (const p of prepared) {
    if (!p.legacyId || !p.name || !p.sku) fail(`Prepared product is missing an identity field: ${JSON.stringify(p)}`);
    if (p.barcode && !validBarcode.test(p.barcode)) fail(`Invalid product barcode: ${p.barcode}`);
  }
  for (const row of [...rows.variants.map((x) => ({ source: 'variant', value: x.barcode })), ...rows.barcodes.map((x) => ({ source: 'product_barcodes', value: x.barcode_number })), ...rows.items.map((x) => ({ source: 'product_items', value: x.barcode }))]) {
    if (!row.value || !validBarcode.test(row.value)) fail(`Invalid ${row.source} barcode: ${row.value || '<blank>'}`);
  }
  return counts;
}

async function verifyLocalImages(manifest) {
  const downloaded = manifest.filter((x) => x.status === 'downloaded');
  const actualFiles = readdirSync(imageDir).filter((name) => !name.startsWith('.'));
  if (actualFiles.length !== expected.validImages) fail(`Expected ${expected.validImages} local images, found ${actualFiles.length}`);
  let bytes = 0;
  for (let i = 0; i < downloaded.length; i += 1) {
    const entry = downloaded[i];
    const path = join(imageDir, entry.fileName);
    const stats = statSync(path);
    bytes += stats.size;
    if (stats.size !== entry.bytes) fail(`Image size mismatch: ${entry.fileName}`);
    const digest = await sha256File(path);
    if (digest !== entry.contentHash) fail(`Image checksum mismatch: ${entry.fileName}`);
    if ((i + 1) % 200 === 0) console.log(`Verified ${i + 1}/${downloaded.length} local images`);
  }
  if (bytes !== expected.validImageBytes) fail(`Image byte total mismatch: expected ${expected.validImageBytes}, found ${bytes}`);
  return { files: downloaded.length, bytes };
}

function database() {
  let databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) fail('DATABASE_PUBLIC_URL or DATABASE_URL is required for live database work.');
  const parsed = new URL(databaseUrl);
  if (process.env.MIGRATION_DB_HOST && process.env.MIGRATION_DB_PORT) {
    parsed.hostname = process.env.MIGRATION_DB_HOST;
    parsed.port = process.env.MIGRATION_DB_PORT;
    databaseUrl = parsed.toString();
  } else
  if (parsed.hostname.endsWith('.railway.internal')) {
    if (!process.env.RAILWAY_TCP_PROXY_DOMAIN || !process.env.RAILWAY_TCP_PROXY_PORT) {
      fail('The database URL is private and Railway TCP proxy variables are unavailable.');
    }
    parsed.hostname = process.env.RAILWAY_TCP_PROXY_DOMAIN;
    parsed.port = process.env.RAILWAY_TCP_PROXY_PORT;
    databaseUrl = parsed.toString();
  }
  return postgres(databaseUrl, { max: 5, ssl: process.env.PGSSLMODE === 'disable' ? false : 'require', idle_timeout: 20, connect_timeout: 20 });
}

async function resolveOwner(sql) {
  const owners = await sql`
    select u.id, lower(u.email) as email, p.role, p.full_name
    from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = ${adminEmail} and p.role = 'admin'
  `;
  if (owners.length !== 1) fail(`Owner lookup must return exactly one admin for ${adminEmail}; found ${owners.length}.`);
  const ownerId = owners[0].id;
  const references = await sql`
    select 'products' as source, owner_id::text, count(*)::int as records from public.products group by owner_id
    union all select 'staff_members', owner_id::text, count(*)::int from public.staff_members group by owner_id
    union all select 'customers', owner_id::text, count(*)::int from public.customers group by owner_id
    union all select 'bookings', owner_id::text, count(*)::int from public.bookings group by owner_id
  `;
  const foreignActiveOwners = [...new Set(references.filter((r) => r.records > 0 && r.owner_id !== ownerId).map((r) => r.owner_id))];
  if (foreignActiveOwners.length) fail(`Live data references ${foreignActiveOwners.length} owner(s) other than the approved Vadodara admin. Owner assignment is ambiguous.`);
  return { ownerId, owner: owners[0], references };
}

async function ensureMappingTables(tx) {
  await tx.unsafe(`
    create table if not exists public.legacy_inventory_product_map (
      owner_id uuid not null references auth.users(id) on delete cascade,
      source text not null check (source in ('products','retail_products')),
      legacy_id uuid not null,
      product_id bigint not null references public.products(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (owner_id, source, legacy_id),
      unique (owner_id, product_id)
    );
    create table if not exists public.legacy_inventory_variant_map (
      owner_id uuid not null references auth.users(id) on delete cascade,
      legacy_id uuid not null,
      variant_id bigint not null references public.product_variants(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (owner_id, legacy_id),
      unique (owner_id, variant_id)
    );
  `);
}

async function conflictAudit(sql, ownerId, source) {
  const tableExists = await sql`select to_regclass('public.legacy_inventory_product_map')::text as products, to_regclass('public.legacy_inventory_variant_map')::text as variants`;
  const mappedProducts = tableExists[0].products ? await sql`select legacy_id::text, product_id from public.legacy_inventory_product_map where owner_id=${ownerId}` : [];
  const mappedProductIds = new Set(mappedProducts.map((x) => String(x.product_id)));
  const skus = source.prepared.map((x) => x.sku);
  const barcodes = source.prepared.map((x) => x.barcode).filter(Boolean);
  const productConflicts = await sql`select id, sku, barcode from public.products where owner_id=${ownerId} and (sku = any(${skus}) or barcode = any(${barcodes}))`;
  const unmappedProductConflicts = productConflicts.filter((x) => !mappedProductIds.has(String(x.id)));
  const variantRows = source.rows.variants.map((x) => ({ sku: nullable(x.sku) || `LEGACY-VARIANT-${x.id}`, barcode: nullable(x.barcode) }));
  const mappedVariants = tableExists[0].variants ? await sql`select legacy_id::text, variant_id from public.legacy_inventory_variant_map where owner_id=${ownerId}` : [];
  const mappedVariantIds = new Set(mappedVariants.map((x) => String(x.variant_id)));
  const variantConflicts = await sql`select id, sku, barcode from public.product_variants where owner_id=${ownerId} and (sku = any(${variantRows.map((x) => x.sku)}) or barcode = any(${variantRows.map((x) => x.barcode).filter(Boolean)}))`;
  const unmappedVariantConflicts = variantConflicts.filter((x) => !mappedVariantIds.has(String(x.id)));
  const unitSources = [...source.rows.barcodes.map((x) => ({ legacySource: 'product_barcodes', legacyId: x.id, barcode: x.barcode_number })), ...source.rows.items.map((x) => ({ legacySource: 'product_items', legacyId: x.id, barcode: x.barcode }))];
  const unitBarcodes = unitSources.map((x) => x.barcode);
  const existingUnits = await sql`select id, legacy_source, legacy_id::text, barcode from public.product_units where owner_id=${ownerId} and barcode = any(${unitBarcodes})`;
  const byLegacy = new Map(unitSources.map((x) => [`${x.legacySource}:${x.legacyId}`, x.barcode]));
  const unitConflicts = existingUnits.filter((x) => byLegacy.get(`${x.legacy_source}:${x.legacy_id}`) !== x.barcode);
  if (unmappedProductConflicts.length || unmappedVariantConflicts.length || unitConflicts.length) {
    fail(`Live conflicts found (products=${unmappedProductConflicts.length}, variants=${unmappedVariantConflicts.length}, units=${unitConflicts.length}). No import was performed.`);
  }
  return { mappedProducts: mappedProducts.length, mappedVariants: mappedVariants.length, existingUnits: existingUnits.length };
}

async function backupDatabase(sql) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(preparedDir, 'backups');
  mkdirSync(backupDir, { recursive: true });
  const tables = await sql`
    select table_schema, table_name from information_schema.tables
    where table_type='BASE TABLE' and table_schema in ('auth','public')
    order by table_schema, table_name
  `;
  const snapshot = { format: 'safawala-json-snapshot-v1', createdAt: new Date().toISOString(), database: 'Railway production', tables: {} };
  await sql.begin('isolation level repeatable read read only', async (tx) => {
    for (const table of tables) {
      const key = `${table.table_schema}.${table.table_name}`;
      if (!/^[a-z_][a-z0-9_]*$/.test(table.table_schema) || !/^[a-z_][a-z0-9_]*$/.test(table.table_name)) fail(`Unsafe table name: ${key}`);
      snapshot.tables[key] = await tx.unsafe(`select * from "${table.table_schema}"."${table.table_name}"`);
    }
  });
  const raw = Buffer.from(JSON.stringify(snapshot));
  const compressed = gzipSync(raw, { level: 9 });
  const path = join(backupDir, `railway-before-legacy-inventory-${stamp}.json.gz`);
  writeFileSync(path, compressed, { flag: 'wx' });
  const restored = JSON.parse(gunzipSync(readFileSync(path, null)).toString('utf8'));
  if (restored.format !== snapshot.format || Object.keys(restored.tables).length !== tables.length) fail('Backup verification failed.');
  const checksum = createHash('sha256').update(compressed).digest('hex');
  writeFileSync(`${path}.sha256`, `${checksum}  ${basename(path)}\n`, { flag: 'wx' });
  return { path, bytes: compressed.length, checksum, tables: tables.length };
}

function storage() {
  const bucket = process.env.BUCKET || process.env.S3_BUCKET;
  const endpoint = process.env.ENDPOINT || process.env.S3_ENDPOINT;
  const region = process.env.REGION || process.env.S3_REGION || 'auto';
  const accessKeyId = process.env.ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) fail('Railway Bucket credentials are required for image upload.');
  const client = new S3Client({ endpoint, region, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', credentials: { accessKeyId, secretAccessKey } });
  return { client, bucket };
}
function objectKey(fileName) { return `product-images/legacy-inventory/${fileName}`; }
async function withRetry(action, label, attempts = 5) {
  let last;
  for (let i = 0; i < attempts; i += 1) try { return await action(); } catch (error) { last = error; if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 800 * 2 ** i)); }
  throw new Error(`${label} failed after ${attempts} attempts: ${last?.message || last}`);
}
async function mapLimit(items, limit, worker) {
  let cursor = 0; const results = [];
  await Promise.all(Array.from({ length: limit }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; results[index] = await worker(items[index], index); } }));
  return results;
}
async function inspectBucket(manifest) {
  const { client, bucket } = storage();
  let token; let existingBytes = 0; let existingObjects = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }), { abortSignal: AbortSignal.timeout(30_000) });
    for (const item of page.Contents || []) { existingBytes += Number(item.Size || 0); existingObjects += 1; }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const requiredBytes = manifest.filter((x) => x.status === 'downloaded').reduce((sum, x) => sum + x.bytes, 0);
  const capacity = Number(process.env.BUCKET_CAPACITY_BYTES || 0);
  if (capacity && existingBytes + requiredBytes > capacity) fail(`Bucket capacity is insufficient: ${existingBytes} existing + ${requiredBytes} required > ${capacity}.`);
  return { bucket, existingObjects, existingBytes, requiredBytes, configuredCapacityBytes: capacity || null };
}
async function uploadImages(manifest) {
  if (!confirmation) fail('Set CONFIRM_PRODUCTION_INVENTORY_IMPORT=YES to authorize image writes.');
  const { client, bucket } = storage();
  const entries = manifest.filter((x) => x.status === 'downloaded');
  const concurrency = Math.min(24, Math.max(1, integer(process.env.IMAGE_UPLOAD_CONCURRENCY, 16)));
  let uploaded = 0; let skipped = 0;
  console.log(`Uploading with concurrency=${concurrency}`);
  await mapLimit(entries, concurrency, async (entry, index) => {
    const Key = objectKey(entry.fileName);
    let head = null;
    try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key }), { abortSignal: AbortSignal.timeout(30_000) }); } catch (error) { if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchKey') throw error; }
    if (head) {
      const checksum = head.Metadata?.sha256 || head.Metadata?.contenthash;
      if (Number(head.ContentLength) !== entry.bytes || checksum !== entry.contentHash) fail(`Existing bucket object conflicts with source: ${Key}`);
      skipped += 1;
    } else {
      await withRetry(() => client.send(new PutObjectCommand({ Bucket: bucket, Key, Body: createReadStream(join(imageDir, entry.fileName)), ContentLength: entry.bytes, ContentType: entry.mimeType, CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: entry.contentHash } }), { abortSignal: AbortSignal.timeout(120_000) }), `Upload ${Key}`);
      const verified = await client.send(new HeadObjectCommand({ Bucket: bucket, Key }), { abortSignal: AbortSignal.timeout(30_000) });
      if (Number(verified.ContentLength) !== entry.bytes || verified.Metadata?.sha256 !== entry.contentHash) fail(`Post-upload verification failed: ${Key}`);
      uploaded += 1;
    }
    if ((index + 1) % 50 === 0) console.log(`Bucket progress ${index + 1}/${entries.length} (uploaded=${uploaded}, skipped=${skipped})`);
  });
  return { uploaded, skipped, total: entries.length };
}

function imagePath(url, imageByUrl) {
  if (!url) return null;
  const entry = imageByUrl.get(url);
  if (!entry) fail(`Image URL is absent from manifest: ${url}`);
  if (entry.status !== 'downloaded') return null;
  return `${publicImagePrefix}${encodeURIComponent(entry.fileName)}`;
}

export async function importData(sql, ownerId, source) {
  if (!confirmation) fail('Set CONFIRM_PRODUCTION_INVENTORY_IMPORT=YES to authorize database writes.');
  const { prepared, legacyMap, manifest, rows } = source;
  const imageByUrl = new Map(manifest.map((x) => [x.url, x]));
  const productsById = new Map(rows.products.map((x) => [x.id, x]));
  const retailById = new Map(rows.retail.map((x) => [x.id, x]));
  const result = await sql.begin(async (tx) => {
    await ensureMappingTables(tx);
    await conflictAudit(tx, ownerId, source);
    const destinationProductByLegacy = new Map();
    let insertedProducts = 0; let updatedProducts = 0;
    let productProgress = 0;
    await mapLimit(prepared, 32, async (p) => {
      const sourceName = p.source === 'retail_products' ? 'retail_products' : 'products';
      const original = sourceName === 'retail_products' ? retailById.get(p.legacyId) : productsById.get(p.legacyId);
      if (!original) fail(`Original source row missing for ${sourceName}:${p.legacyId}`);
      const images = p.images.map((url) => imagePath(url, imageByUrl)).filter(Boolean);
      const mapped = await tx`select product_id from public.legacy_inventory_product_map where owner_id=${ownerId} and source=${sourceName} and legacy_id=${p.legacyId}`;
      let productId;
      if (mapped.length) {
        productId = mapped[0].product_id;
        await tx`update public.products set sku=${p.sku}, barcode=${nullable(p.barcode)}, name=${p.name}, description=${nullable(p.description)}, category=${nullable(p.category)}, subcategory=${nullable(p.subcategory)}, size=${nullable(p.size)}, color=${nullable(p.color)}, material=${nullable(p.material)}, cost_price=${number(p.costPrice)}, regular_price=${number(p.regularPrice)}, sale_price=${number(p.salePrice)}, rental_price=${number(p.rentalPrice)}, security_deposit=${number(p.securityDeposit)}, stock_quantity=${integer(p.stockQuantity)}, reorder_level=${integer(p.reorderLevel)}, is_active=${bool(p.isActive)}, image_urls=${images}, updated_at=${nullable(original.updated_at) || nullable(original.created_at) || new Date().toISOString()} where id=${productId} and owner_id=${ownerId}`;
        updatedProducts += 1;
      } else {
        const inserted = await tx`insert into public.products (owner_id,sku,barcode,name,description,category,subcategory,size,color,material,cost_price,regular_price,sale_price,rental_price,security_deposit,stock_quantity,reorder_level,is_active,image_urls,created_at,updated_at) values (${ownerId},${p.sku},${nullable(p.barcode)},${p.name},${nullable(p.description)},${nullable(p.category)},${nullable(p.subcategory)},${nullable(p.size)},${nullable(p.color)},${nullable(p.material)},${number(p.costPrice)},${number(p.regularPrice)},${number(p.salePrice)},${number(p.rentalPrice)},${number(p.securityDeposit)},${integer(p.stockQuantity)},${integer(p.reorderLevel)},${bool(p.isActive)},${images},${nullable(original.created_at) || new Date().toISOString()},${nullable(original.updated_at) || nullable(original.created_at) || new Date().toISOString()}) returning id`;
        productId = inserted[0].id; insertedProducts += 1;
        await tx`insert into public.legacy_inventory_product_map (owner_id,source,legacy_id,product_id) values (${ownerId},${sourceName},${p.legacyId},${productId})`;
      }
      destinationProductByLegacy.set(p.legacyId, productId);
      for (const legacyId of p.legacyIds || [p.legacyId]) if (!destinationProductByLegacy.has(legacyId)) destinationProductByLegacy.set(legacyId, productId);
      productProgress += 1;
      if (productProgress % 250 === 0) console.log(`Database product progress ${productProgress}/${prepared.length}`);
    });
    for (const [oldId, canonicalId] of Object.entries(legacyMap)) {
      const id = destinationProductByLegacy.get(canonicalId);
      if (!id) fail(`Destination product mapping missing for legacy ${oldId} -> ${canonicalId}`);
      destinationProductByLegacy.set(oldId, id);
    }
    let insertedVariants = 0; let updatedVariants = 0;
    await mapLimit(rows.variants, 16, async (row) => {
      const productId = destinationProductByLegacy.get(row.product_id);
      if (!productId) fail(`Variant ${row.id} references unmapped product ${row.product_id}`);
      const sku = nullable(row.sku) || `LEGACY-VARIANT-${row.id}`;
      const variantImage = imagePath(nullable(row.image_url), imageByUrl);
      if (row.id === broken.legacyId && variantImage !== null) fail('The approved broken Golden Zari image must remain null.');
      const mapped = await tx`select variant_id from public.legacy_inventory_variant_map where owner_id=${ownerId} and legacy_id=${row.id}`;
      let variantId;
      if (mapped.length) {
        variantId = mapped[0].variant_id;
        await tx`update public.product_variants set product_id=${productId},name=${row.variation_name},sku=${sku},barcode=${nullable(row.barcode)},size=${nullable(row.size)},color=${nullable(row.color)},design=${nullable(row.design)},material=${nullable(row.material)},regular_price_adjustment=${number(row.regular_price_adjustment)},sale_price_adjustment=${number(row.price_adjustment)},rental_price_adjustment=${number(row.rental_price_adjustment)},stock_quantity=${integer(row.stock_total)},image_url=${variantImage},updated_at=${nullable(row.updated_at) || nullable(row.created_at) || new Date().toISOString()} where id=${variantId} and owner_id=${ownerId}`;
        updatedVariants += 1;
      } else {
        const inserted = await tx`insert into public.product_variants (owner_id,product_id,name,sku,barcode,size,color,design,material,regular_price_adjustment,sale_price_adjustment,rental_price_adjustment,stock_quantity,image_url,created_at,updated_at) values (${ownerId},${productId},${row.variation_name},${sku},${nullable(row.barcode)},${nullable(row.size)},${nullable(row.color)},${nullable(row.design)},${nullable(row.material)},${number(row.regular_price_adjustment)},${number(row.price_adjustment)},${number(row.rental_price_adjustment)},${integer(row.stock_total)},${variantImage},${nullable(row.created_at) || new Date().toISOString()},${nullable(row.updated_at) || nullable(row.created_at) || new Date().toISOString()}) returning id`;
        variantId = inserted[0].id; insertedVariants += 1;
        await tx`insert into public.legacy_inventory_variant_map (owner_id,legacy_id,variant_id) values (${ownerId},${row.id},${variantId})`;
      }
    });
    let insertedUnits = 0; let updatedUnits = 0;
    const units = [
      ...rows.barcodes.map((row) => ({ legacySource: 'product_barcodes', legacyId: row.id, productId: row.product_id, itemCode: null, barcode: row.barcode_number, qrCode: null, serialNumber: null, status: row.status, condition: bool(row.is_new) ? 'new' : null, location: null, notes: nullable(row.notes), legacyBookingId: nullable(row.booking_id), lastUsedAt: nullable(row.last_used_at), usageCount: 0, active: true, createdAt: row.created_at, updatedAt: row.updated_at })),
      ...rows.items.map((row) => ({ legacySource: 'product_items', legacyId: row.id, productId: row.product_id, itemCode: nullable(row.item_code), barcode: row.barcode, qrCode: nullable(row.qr_code), serialNumber: nullable(row.serial_number), status: row.status, condition: nullable(row.condition), location: nullable(row.location), notes: nullable(row.notes), legacyBookingId: null, lastUsedAt: nullable(row.last_used_date), usageCount: integer(row.usage_count), active: true, createdAt: row.created_at, updatedAt: row.updated_at })),
    ];
    let unitProgress = 0;
    await mapLimit(units, 32, async (unit) => {
      const productId = destinationProductByLegacy.get(unit.productId);
      if (!productId) fail(`Unit ${unit.legacySource}:${unit.legacyId} references unmapped product ${unit.productId}`);
      const existing = await tx`select id from public.product_units where owner_id=${ownerId} and legacy_source=${unit.legacySource} and legacy_id=${unit.legacyId}`;
      if (existing.length) {
        await tx`update public.product_units set product_id=${productId},item_code=${unit.itemCode},barcode=${unit.barcode},qr_code=${unit.qrCode},serial_number=${unit.serialNumber},status=${unit.status},condition=${unit.condition},location=${unit.location},notes=${unit.notes},legacy_booking_id=${unit.legacyBookingId},last_used_at=${unit.lastUsedAt},usage_count=${unit.usageCount},is_active=${unit.active},updated_at=${nullable(unit.updatedAt) || nullable(unit.createdAt) || new Date().toISOString()} where id=${existing[0].id} and owner_id=${ownerId}`;
        updatedUnits += 1;
      } else {
        await tx`insert into public.product_units (owner_id,product_id,legacy_source,legacy_id,item_code,barcode,qr_code,serial_number,status,condition,location,notes,legacy_booking_id,last_used_at,usage_count,is_active,created_at,updated_at) values (${ownerId},${productId},${unit.legacySource},${unit.legacyId},${unit.itemCode},${unit.barcode},${unit.qrCode},${unit.serialNumber},${unit.status},${unit.condition},${unit.location},${unit.notes},${unit.legacyBookingId},${unit.lastUsedAt},${unit.usageCount},${unit.active},${nullable(unit.createdAt) || new Date().toISOString()},${nullable(unit.updatedAt) || nullable(unit.createdAt) || new Date().toISOString()})`;
        insertedUnits += 1;
      }
      unitProgress += 1;
      if (unitProgress % 250 === 0) console.log(`Database unit progress ${unitProgress}/${units.length}`);
    });
    const validation = await verifyDatabase(tx, ownerId);
    if (validation.migrationProducts !== expected.preparedProducts || validation.migrationVariants !== expected.variants || validation.migrationUnits !== expected.units || validation.orphans !== 0 || validation.invalidRows !== 0) fail(`Transactional validation failed: ${JSON.stringify(validation)}`);
    return { insertedProducts, updatedProducts, insertedVariants, updatedVariants, insertedUnits, updatedUnits, archivesSkipped: rows.archives.length, ...validation };
  });
  return result;
}

async function importDataSetBased(sql, ownerId, source) {
  if (!confirmation) fail('Set CONFIRM_PRODUCTION_INVENTORY_IMPORT=YES to authorize database writes.');
  const { prepared, legacyMap, manifest, rows } = source;
  const imageByUrl = new Map(manifest.map((x) => [x.url, x]));
  const productsById = new Map(rows.products.map((x) => [x.id, x]));
  const retailById = new Map(rows.retail.map((x) => [x.id, x]));
  const now = new Date().toISOString();
  const productStage = prepared.map((p) => {
    const sourceName = p.source === 'retail_products' ? 'retail_products' : 'products';
    const original = sourceName === 'retail_products' ? retailById.get(p.legacyId) : productsById.get(p.legacyId);
    if (!original) fail(`Original source row missing for ${sourceName}:${p.legacyId}`);
    return {
      source: sourceName, legacy_id: p.legacyId, sku: p.sku, barcode: nullable(p.barcode), name: p.name,
      description: nullable(p.description), category: nullable(p.category), subcategory: nullable(p.subcategory),
      size: nullable(p.size), color: nullable(p.color), material: nullable(p.material), cost_price: number(p.costPrice),
      regular_price: number(p.regularPrice), sale_price: number(p.salePrice), rental_price: number(p.rentalPrice),
      security_deposit: number(p.securityDeposit), stock_quantity: integer(p.stockQuantity), reorder_level: integer(p.reorderLevel),
      is_active: bool(p.isActive), image_urls: p.images.map((url) => imagePath(url, imageByUrl)).filter(Boolean),
      created_at: nullable(original.created_at) || now, updated_at: nullable(original.updated_at) || nullable(original.created_at) || now,
    };
  });
  const variantStage = rows.variants.map((row) => {
    const productLegacyId = legacyMap[row.product_id];
    if (!productLegacyId) fail(`Variant ${row.id} references unmapped product ${row.product_id}`);
    const variantImage = imagePath(nullable(row.image_url), imageByUrl);
    if (row.id === broken.legacyId && variantImage !== null) fail('The approved broken Golden Zari image must remain null.');
    return {
      legacy_id: row.id, product_legacy_id: productLegacyId, name: row.variation_name,
      sku: nullable(row.sku) || `LEGACY-VARIANT-${row.id}`, barcode: nullable(row.barcode), size: nullable(row.size),
      color: nullable(row.color), design: nullable(row.design), material: nullable(row.material),
      regular_price_adjustment: number(row.regular_price_adjustment), sale_price_adjustment: number(row.price_adjustment),
      rental_price_adjustment: number(row.rental_price_adjustment), stock_quantity: integer(row.stock_total), image_url: variantImage,
      created_at: nullable(row.created_at) || now, updated_at: nullable(row.updated_at) || nullable(row.created_at) || now,
    };
  });
  const unitStage = [
    ...rows.barcodes.map((row) => ({ legacy_source: 'product_barcodes', legacy_id: row.id, product_legacy_id: legacyMap[row.product_id], item_code: null, barcode: row.barcode_number, qr_code: null, serial_number: null, status: row.status, condition: bool(row.is_new) ? 'new' : null, location: null, notes: nullable(row.notes), legacy_booking_id: nullable(row.booking_id), last_used_at: nullable(row.last_used_at), usage_count: 0, is_active: true, created_at: nullable(row.created_at) || now, updated_at: nullable(row.updated_at) || nullable(row.created_at) || now })),
    ...rows.items.map((row) => ({ legacy_source: 'product_items', legacy_id: row.id, product_legacy_id: legacyMap[row.product_id], item_code: nullable(row.item_code), barcode: row.barcode, qr_code: nullable(row.qr_code), serial_number: nullable(row.serial_number), status: row.status, condition: nullable(row.condition), location: nullable(row.location), notes: nullable(row.notes), legacy_booking_id: null, last_used_at: nullable(row.last_used_date), usage_count: integer(row.usage_count), is_active: true, created_at: nullable(row.created_at) || now, updated_at: nullable(row.updated_at) || nullable(row.created_at) || now })),
  ];
  for (const unit of unitStage) if (!unit.product_legacy_id) fail(`Unit ${unit.legacy_source}:${unit.legacy_id} references an unmapped product.`);

  return sql.begin(async (tx) => {
    await ensureMappingTables(tx);
    await conflictAudit(tx, ownerId, source);
    const before = await verifyDatabase(tx, ownerId);
    await tx.unsafe(`
      create temp table migration_products_stage (
        source text, legacy_id uuid, sku text, barcode text, name text, description text, category text, subcategory text,
        size text, color text, material text, cost_price numeric, regular_price numeric, sale_price numeric, rental_price numeric,
        security_deposit numeric, stock_quantity integer, reorder_level integer, is_active boolean, image_urls jsonb,
        created_at timestamptz, updated_at timestamptz
      ) on commit drop;
      create temp table migration_variants_stage (
        legacy_id uuid, product_legacy_id uuid, name text, sku text, barcode text, size text, color text, design text,
        material text, regular_price_adjustment numeric, sale_price_adjustment numeric, rental_price_adjustment numeric,
        stock_quantity integer, image_url text, created_at timestamptz, updated_at timestamptz
      ) on commit drop;
      create temp table migration_units_stage (
        legacy_source text, legacy_id uuid, product_legacy_id uuid, item_code text, barcode text, qr_code text,
        serial_number text, status text, condition text, location text, notes text, legacy_booking_id uuid,
        last_used_at timestamptz, usage_count integer, is_active boolean, created_at timestamptz, updated_at timestamptz
      ) on commit drop;
    `);
    await tx`insert into migration_products_stage select * from jsonb_to_recordset(${tx.json(productStage)}::jsonb) as x(source text,legacy_id uuid,sku text,barcode text,name text,description text,category text,subcategory text,size text,color text,material text,cost_price numeric,regular_price numeric,sale_price numeric,rental_price numeric,security_deposit numeric,stock_quantity integer,reorder_level integer,is_active boolean,image_urls jsonb,created_at timestamptz,updated_at timestamptz)`;
    await tx`insert into migration_variants_stage select * from jsonb_to_recordset(${tx.json(variantStage)}::jsonb) as x(legacy_id uuid,product_legacy_id uuid,name text,sku text,barcode text,size text,color text,design text,material text,regular_price_adjustment numeric,sale_price_adjustment numeric,rental_price_adjustment numeric,stock_quantity integer,image_url text,created_at timestamptz,updated_at timestamptz)`;
    await tx`insert into migration_units_stage select * from jsonb_to_recordset(${tx.json(unitStage)}::jsonb) as x(legacy_source text,legacy_id uuid,product_legacy_id uuid,item_code text,barcode text,qr_code text,serial_number text,status text,condition text,location text,notes text,legacy_booking_id uuid,last_used_at timestamptz,usage_count integer,is_active boolean,created_at timestamptz,updated_at timestamptz)`;
    console.log('Bulk staging complete.');

    await tx`update public.products p set sku=s.sku,barcode=s.barcode,name=s.name,description=s.description,category=s.category,subcategory=s.subcategory,size=s.size,color=s.color,material=s.material,cost_price=s.cost_price,regular_price=s.regular_price,sale_price=s.sale_price,rental_price=s.rental_price,security_deposit=s.security_deposit,stock_quantity=s.stock_quantity,reorder_level=s.reorder_level,is_active=s.is_active,image_urls=coalesce(array(select jsonb_array_elements_text(s.image_urls)),'{}'),updated_at=s.updated_at from migration_products_stage s join public.legacy_inventory_product_map m on m.owner_id=${ownerId} and m.source=s.source and m.legacy_id=s.legacy_id where p.id=m.product_id and p.owner_id=${ownerId}`;
    await tx`insert into public.products (owner_id,sku,barcode,name,description,category,subcategory,size,color,material,cost_price,regular_price,sale_price,rental_price,security_deposit,stock_quantity,reorder_level,is_active,image_urls,created_at,updated_at) select ${ownerId},s.sku,s.barcode,s.name,s.description,s.category,s.subcategory,s.size,s.color,s.material,s.cost_price,s.regular_price,s.sale_price,s.rental_price,s.security_deposit,s.stock_quantity,s.reorder_level,s.is_active,coalesce(array(select jsonb_array_elements_text(s.image_urls)),'{}'),s.created_at,s.updated_at from migration_products_stage s where not exists (select 1 from public.legacy_inventory_product_map m where m.owner_id=${ownerId} and m.source=s.source and m.legacy_id=s.legacy_id)`;
    await tx`insert into public.legacy_inventory_product_map (owner_id,source,legacy_id,product_id) select ${ownerId},s.source,s.legacy_id,p.id from migration_products_stage s join public.products p on p.owner_id=${ownerId} and p.sku=s.sku on conflict (owner_id,source,legacy_id) do nothing`;
    console.log('Bulk products complete.');

    await tx`update public.product_variants v set product_id=pm.product_id,name=s.name,sku=s.sku,barcode=s.barcode,size=s.size,color=s.color,design=s.design,material=s.material,regular_price_adjustment=s.regular_price_adjustment,sale_price_adjustment=s.sale_price_adjustment,rental_price_adjustment=s.rental_price_adjustment,stock_quantity=s.stock_quantity,image_url=s.image_url,updated_at=s.updated_at from migration_variants_stage s join public.legacy_inventory_product_map pm on pm.owner_id=${ownerId} and pm.source='products' and pm.legacy_id=s.product_legacy_id join public.legacy_inventory_variant_map vm on vm.owner_id=${ownerId} and vm.legacy_id=s.legacy_id where v.id=vm.variant_id and v.owner_id=${ownerId}`;
    await tx`insert into public.product_variants (owner_id,product_id,name,sku,barcode,size,color,design,material,regular_price_adjustment,sale_price_adjustment,rental_price_adjustment,stock_quantity,image_url,created_at,updated_at) select ${ownerId},pm.product_id,s.name,s.sku,s.barcode,s.size,s.color,s.design,s.material,s.regular_price_adjustment,s.sale_price_adjustment,s.rental_price_adjustment,s.stock_quantity,s.image_url,s.created_at,s.updated_at from migration_variants_stage s join public.legacy_inventory_product_map pm on pm.owner_id=${ownerId} and pm.source='products' and pm.legacy_id=s.product_legacy_id where not exists (select 1 from public.legacy_inventory_variant_map vm where vm.owner_id=${ownerId} and vm.legacy_id=s.legacy_id)`;
    await tx`insert into public.legacy_inventory_variant_map (owner_id,legacy_id,variant_id) select ${ownerId},s.legacy_id,v.id from migration_variants_stage s join public.product_variants v on v.owner_id=${ownerId} and v.sku=s.sku on conflict (owner_id,legacy_id) do nothing`;
    console.log('Bulk variants complete.');

    await tx`insert into public.product_units (owner_id,product_id,legacy_source,legacy_id,item_code,barcode,qr_code,serial_number,status,condition,location,notes,legacy_booking_id,last_used_at,usage_count,is_active,created_at,updated_at) select ${ownerId},pm.product_id,s.legacy_source,s.legacy_id,s.item_code,s.barcode,s.qr_code,s.serial_number,s.status,s.condition,s.location,s.notes,s.legacy_booking_id,s.last_used_at,s.usage_count,s.is_active,s.created_at,s.updated_at from migration_units_stage s join public.legacy_inventory_product_map pm on pm.owner_id=${ownerId} and pm.source='products' and pm.legacy_id=s.product_legacy_id on conflict (owner_id,legacy_source,legacy_id) do update set product_id=excluded.product_id,item_code=excluded.item_code,barcode=excluded.barcode,qr_code=excluded.qr_code,serial_number=excluded.serial_number,status=excluded.status,condition=excluded.condition,location=excluded.location,notes=excluded.notes,legacy_booking_id=excluded.legacy_booking_id,last_used_at=excluded.last_used_at,usage_count=excluded.usage_count,is_active=excluded.is_active,updated_at=excluded.updated_at`;
    console.log('Bulk units complete; all archive records skipped by user request.');
    const validation = await verifyDatabase(tx, ownerId);
    if (validation.migrationProducts !== expected.preparedProducts || validation.migrationVariants !== expected.variants || validation.migrationUnits !== expected.units || validation.archiveEvents !== 0 || validation.orphans !== 0 || validation.invalidRows !== 0) fail(`Transactional validation failed: ${JSON.stringify(validation)}`);
    return {
      insertedProducts: expected.preparedProducts - before.migrationProducts,
      updatedProducts: before.migrationProducts,
      insertedVariants: expected.variants - before.migrationVariants,
      updatedVariants: before.migrationVariants,
      insertedUnits: expected.units - before.migrationUnits,
      updatedUnits: before.migrationUnits,
      archivesSkipped: rows.archives.length,
      ...validation,
    };
  });
}

async function verifyDatabase(sql, ownerId) {
  const hasMaps = await sql`select to_regclass('public.legacy_inventory_product_map')::text as products, to_regclass('public.legacy_inventory_variant_map')::text as variants`;
  if (!hasMaps[0].products) return { migrationProducts: 0, migrationVariants: 0, migrationUnits: 0, archiveEvents: 0, orphans: 0, invalidRows: 0 };
  const [counts] = await sql`
    select
      (select count(*)::int from public.legacy_inventory_product_map where owner_id=${ownerId}) migration_products,
      (select count(*)::int from public.legacy_inventory_variant_map where owner_id=${ownerId}) migration_variants,
      (select count(*)::int from public.product_units where owner_id=${ownerId} and legacy_source in ('product_barcodes','product_items')) migration_units,
      0::int archive_events,
      ((select count(*) from public.legacy_inventory_product_map m left join public.products p on p.id=m.product_id and p.owner_id=m.owner_id where m.owner_id=${ownerId} and p.id is null) +
       (select count(*) from public.legacy_inventory_variant_map m left join public.product_variants v on v.id=m.variant_id and v.owner_id=m.owner_id where m.owner_id=${ownerId} and v.id is null) +
       (select count(*) from public.product_units u left join public.products p on p.id=u.product_id and p.owner_id=u.owner_id where u.owner_id=${ownerId} and u.legacy_source in ('product_barcodes','product_items') and p.id is null))::int orphans,
      ((select count(*) from public.legacy_inventory_product_map m join public.products p on p.id=m.product_id where m.owner_id=${ownerId} and (trim(p.name)='' or p.stock_quantity<0 or p.sale_price<0 or p.rental_price<0)) +
       (select count(*) from public.legacy_inventory_variant_map m join public.product_variants v on v.id=m.variant_id where m.owner_id=${ownerId} and (trim(v.name)='' or v.stock_quantity<0)))::int invalid_rows
  `;
  return {
    migrationProducts: counts.migration_products, migrationVariants: counts.migration_variants,
    migrationUnits: counts.migration_units, archiveEvents: counts.archive_events,
    orphans: counts.orphans, invalidRows: counts.invalid_rows,
  };
}

async function writeReport(report) {
  const reportDir = join(preparedDir, 'reports'); mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(reportDir, `legacy-inventory-migration-${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return path;
}

async function main() {
  const startedAt = new Date().toISOString();
  if (command === 'envcheck') {
    const keys = Object.keys(process.env).filter((key) => /DATABASE|POSTGRES|PGHOST|PGPORT|PROXY|BUCKET|ENDPOINT|ACCESS_KEY|REGION/i.test(key)).sort();
    const urls = Object.fromEntries(keys.filter((key) => /URL|ENDPOINT/i.test(key)).map((key) => {
      try { const parsed = new URL(process.env[key]); return [key, { protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port || null }]; }
      catch { return [key, { configured: Boolean(process.env[key]) }]; }
    }));
    console.log(JSON.stringify({ keys, urls }, null, 2));
    return;
  }
  const source = loadSources();
  const counts = assertSourceShape(source);
  console.log('Source structure validated:', counts);
  if (command === 'audit') {
    const localImages = await verifyLocalImages(source.manifest);
    console.log('Local image audit passed:', localImages);
    return;
  }
  if (command === 'bucket-preflight') {
    console.log('Bucket preflight:', await inspectBucket(source.manifest));
    return;
  }
  if (command === 'upload') {
    if (!confirmation) fail('Set CONFIRM_PRODUCTION_INVENTORY_IMPORT=YES for upload.');
    const report = { startedAt, command, source: counts, bucketPreflight: await inspectBucket(source.manifest) };
    report.images = await uploadImages(source.manifest);
    report.completedAt = new Date().toISOString();
    report.reportPath = await writeReport(report);
    console.log('Image migration completed successfully:', report);
    return;
  }
  const sql = database();
  try {
    const owner = await resolveOwner(sql);
    console.log(`Resolved approved owner: ${owner.owner.email} (${owner.ownerId})`);
    const conflicts = await conflictAudit(sql, owner.ownerId, source);
    console.log('Live conflict audit passed:', conflicts);
    if (command === 'db-preflight') { return; }
    if (command === 'preflight') { console.log('Bucket preflight:', await inspectBucket(source.manifest)); return; }
    if (command === 'backup') { console.log('Backup completed:', await backupDatabase(sql)); return; }
    if (command === 'verify') { console.log('Database verification:', await verifyDatabase(sql, owner.ownerId)); return; }
    if (!['import', 'all'].includes(command)) fail(`Unknown command: ${command}`);
    if (!confirmation) fail('Set CONFIRM_PRODUCTION_INVENTORY_IMPORT=YES for import/all.');
    const report = { startedAt, command, owner: { id: owner.ownerId, email: owner.owner.email }, source: counts };
    if (command === 'all') {
      report.localImages = await verifyLocalImages(source.manifest);
      report.bucketPreflight = await inspectBucket(source.manifest);
      report.backup = await backupDatabase(sql);
    }
    if (command === 'all') report.images = await uploadImages(source.manifest);
    if (command === 'import' || command === 'all') report.database = await importDataSetBased(sql, owner.ownerId, source);
    report.verification = await verifyDatabase(sql, owner.ownerId);
    report.completedAt = new Date().toISOString();
    report.reportPath = await writeReport(report);
    console.log('Migration completed successfully:', report);
  } finally { await sql.end({ timeout: 5 }); }
}

main().catch((error) => { console.error(`MIGRATION FAILED: ${error.message}`); process.exitCode = 1; });
