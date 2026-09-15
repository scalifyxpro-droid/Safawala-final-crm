import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { parse } from 'csv-parse/sync';

const sourceDir = process.env.LEGACY_CSV_DIR || join(homedir(), 'Downloads');
const outputDir = join(process.cwd(), 'migration', 'legacy-inventory');
const imageDir = join(outputDir, 'images');
const vadodaraFranchiseId = '1a518dde-85b7-44ef-8bc4-092f53ddfd99';
const barcodePattern = /^[A-Za-z0-9_-]{1,50}$/;
const command = process.argv[2] || 'audit';

const csvFiles = {
  franchises: 'franchises_rows.csv',
  productArchive: 'product_archive_rows.csv',
  productBarcodes: 'product_barcodes_rows.csv',
  categories: 'product_categories_rows.csv',
  productImages: 'product_images_rows.csv',
  productItems: 'product_items_rows.csv',
  variants: 'product_variations_rows.csv',
  products: 'products_rows.csv',
  retailProducts: 'retail_products_rows.csv',
};

async function readCsv(fileName) {
  const text = await readFile(join(sourceDir, fileName), 'utf8');
  return parse(text, {
    columns: true,
    bom: true,
    relax_column_count: false,
    skip_empty_lines: true,
  });
}

function clean(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function normalizeBarcode(value, label) {
  const result = clean(value);
  if (result && !barcodePattern.test(result)) {
    throw new Error(`${label} has an unsupported barcode: ${result}`);
  }
  return result;
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.trunc(number(value, fallback)));
}

function boolean(value, fallback = true) {
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stableSku(row, prefix = 'LEGACY') {
  return clean(row.sku) || clean(row.product_code) || `${prefix}-${row.id}`;
}

function imageExtension(url, mimeType) {
  const byMime = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  if (byMime[mimeType]) return byMime[mimeType];
  try {
    const suffix = extname(new URL(url).pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(suffix)) {
      return suffix === '.jpeg' ? '.jpg' : suffix;
    }
  } catch {}
  return '.img';
}

async function loadData() {
  const entries = await Promise.all(
    Object.entries(csvFiles).map(async ([key, fileName]) => [key, await readCsv(fileName)]),
  );
  return Object.fromEntries(entries);
}

function prepare(data) {
  const categoryById = new Map(data.categories.map((row) => [row.id, row]));
  const productById = new Map(data.products.map((row) => [row.id, row]));

  const barcodeGroups = new Map();
  for (const row of data.products) {
    const barcode = normalizeBarcode(row.barcode, `products:${row.id}`);
    if (!barcode) continue;
    const group = barcodeGroups.get(barcode) || [];
    group.push(row);
    barcodeGroups.set(barcode, group);
  }

  const duplicateGroups = [...barcodeGroups.entries()].filter(([, rows]) => rows.length > 1);
  for (const [barcode, rows] of duplicateGroups) {
    if (rows.length !== 2) throw new Error(`Barcode ${barcode} appears ${rows.length} times`);
    const names = unique(rows.map((row) => clean(row.name)?.toLowerCase()));
    const categories = unique(rows.map((row) => clean(row.category_id) || clean(row.category)));
    const prices = unique(
      rows.map((row) => `${number(row.regular_price)}|${number(row.sale_price)}|${number(row.rental_price)}`),
    );
    if (names.length !== 1 || categories.length !== 1 || prices.length !== 1) {
      throw new Error(`Barcode ${barcode} is duplicated across different products`);
    }
    if (rows.filter((row) => row.franchise_id === vadodaraFranchiseId).length !== 1) {
      throw new Error(`Barcode ${barcode} does not have exactly one Vadodara record`);
    }
  }

  const canonicalByLegacyId = new Map();
  const canonicalRows = [];
  const seenCanonicalIds = new Set();
  for (const row of data.products) {
    const barcode = clean(row.barcode);
    const group = barcode ? barcodeGroups.get(barcode) : [row];
    const canonical =
      group.find((candidate) => candidate.franchise_id === vadodaraFranchiseId) || group[0];
    canonicalByLegacyId.set(row.id, canonical.id);
    if (!seenCanonicalIds.has(canonical.id)) {
      seenCanonicalIds.add(canonical.id);
      canonicalRows.push(canonical);
    }
  }

  const imagesByLegacyProduct = new Map();
  for (const image of data.productImages) {
    if (!productById.has(image.product_id)) {
      throw new Error(`Image ${image.id} references missing product ${image.product_id}`);
    }
    const list = imagesByLegacyProduct.get(image.product_id) || [];
    list.push({
      id: image.id,
      url: clean(image.url),
      isMain: boolean(image.is_main, false),
      order: integer(image.order),
      source: 'product_images',
    });
    imagesByLegacyProduct.set(image.product_id, list);
  }
  for (const row of data.products) {
    const directUrl = clean(row.image_url);
    if (!directUrl) continue;
    const list = imagesByLegacyProduct.get(row.id) || [];
    if (!list.some((entry) => entry.url === directUrl)) {
      list.push({ id: row.id, url: directUrl, isMain: true, order: -1, source: 'products' });
    }
    imagesByLegacyProduct.set(row.id, list);
  }

  const productImagesByCanonical = new Map();
  for (const [legacyId, list] of imagesByLegacyProduct) {
    const canonicalId = canonicalByLegacyId.get(legacyId);
    const combined = productImagesByCanonical.get(canonicalId) || [];
    combined.push(...list);
    productImagesByCanonical.set(canonicalId, combined);
  }

  function categoryFor(row) {
    const categoryRecord = categoryById.get(clean(row.category_id));
    const subcategoryRecord = categoryById.get(clean(row.subcategory_id));
    if (categoryRecord?.parent_id) {
      return {
        category: clean(categoryById.get(categoryRecord.parent_id)?.name),
        subcategory: clean(categoryRecord.name),
      };
    }
    const rawCategory = clean(categoryRecord?.name) || clean(row.category);
    return {
      category: categoryById.has(rawCategory) ? clean(categoryById.get(rawCategory)?.name) : rawCategory,
      subcategory: clean(subcategoryRecord?.name) || clean(row.subcategory),
    };
  }

  const products = canonicalRows.map((canonical) => {
    const members = data.products.filter(
      (row) => canonicalByLegacyId.get(row.id) === canonical.id,
    );
    const classification = categoryFor(canonical);
    return {
      legacyId: canonical.id,
      legacyIds: members.map((row) => row.id),
      sku: stableSku(canonical),
      barcode: normalizeBarcode(canonical.barcode, `products:${canonical.id}`),
      name: clean(canonical.name),
      description: clean(canonical.description),
      category: classification.category,
      subcategory: classification.subcategory,
      size: clean(canonical.size),
      color: clean(canonical.color),
      material: clean(canonical.material),
      costPrice: number(canonical.cost_price),
      regularPrice: number(canonical.regular_price || canonical.price),
      salePrice: number(canonical.sale_price || canonical.price),
      rentalPrice: number(canonical.rental_price),
      securityDeposit: number(canonical.security_deposit),
      stockQuantity: members.reduce(
        (sum, row) => {
          const legacyTotal = clean(row.stock_total);
          return sum + integer(legacyTotal === null ? row.stock_quantity : legacyTotal);
        },
        0,
      ),
      reorderLevel: integer(canonical.reorder_level),
      isActive: members.some((row) => boolean(row.is_active)),
      images: unique(
        (productImagesByCanonical.get(canonical.id) || [])
          .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.order - b.order)
          .map((entry) => entry.url),
      ),
    };
  });

  const retailProducts = data.retailProducts.map((row) => ({
    legacyId: row.id,
    legacyIds: [row.id],
    sku: stableSku(row, 'RETAIL'),
    barcode: normalizeBarcode(row.barcode, `retail_products:${row.id}`),
    name: clean(row.name),
    description: null,
    category: clean(row.category),
    subcategory: null,
    size: clean(row.size_spec),
    color: clean(row.color),
    material: clean(row.material),
    costPrice: 0,
    regularPrice: number(row.regular_price || row.sale_price),
    salePrice: number(row.sale_price),
    rentalPrice: 0,
    securityDeposit: 0,
    stockQuantity: integer(row.quantity),
    reorderLevel: 0,
    isActive: clean(row.stock_status)?.toLowerCase() !== 'inactive',
    images: unique([clean(row.main_photo_url)]),
    source: 'retail_products',
  }));

  const skuGroups = [...products, ...retailProducts].reduce((map, row) => {
    const list = map.get(row.sku) || [];
    list.push(row);
    map.set(row.sku, list);
    return map;
  }, new Map());
  const duplicateSkus = [...skuGroups.entries()].filter(([, rows]) => rows.length > 1);
  if (duplicateSkus.length) throw new Error(`Found ${duplicateSkus.length} duplicate destination SKUs`);

  const barcodeRows = [...products, ...retailProducts].filter((row) => row.barcode);
  const destinationBarcodeGroups = barcodeRows.reduce((map, row) => {
    const list = map.get(row.barcode) || [];
    list.push(row);
    map.set(row.barcode, list);
    return map;
  }, new Map());
  const duplicateDestinationBarcodes = [...destinationBarcodeGroups.values()].filter(
    (rows) => rows.length > 1,
  );
  if (duplicateDestinationBarcodes.length) {
    throw new Error(`Found ${duplicateDestinationBarcodes.length} duplicate destination barcodes`);
  }

  for (const [tableName, rows] of [
    ['product_barcodes', data.productBarcodes],
    ['product_items', data.productItems],
    ['product_variations', data.variants],
  ]) {
    for (const row of rows) {
      if (!canonicalByLegacyId.has(row.product_id)) {
        throw new Error(`${tableName}:${row.id} references missing product ${row.product_id}`);
      }
    }
  }

  const unitBarcodes = [
    ...data.productBarcodes.map((row) =>
      normalizeBarcode(row.barcode_number, `product_barcodes:${row.id}`),
    ),
    ...data.productItems.map((row) => normalizeBarcode(row.barcode, `product_items:${row.id}`)),
  ];
  const duplicateUnitBarcodes = [...new Set(unitBarcodes.filter((code, index) => unitBarcodes.indexOf(code) !== index))];
  if (duplicateUnitBarcodes.length) {
    throw new Error(`Found ${duplicateUnitBarcodes.length} duplicate unit barcodes`);
  }

  const imageSources = [];
  for (const product of [...products, ...retailProducts]) {
    for (const url of product.images) {
      imageSources.push({ url, source: product.source || 'products', legacyId: product.legacyId });
    }
  }
  for (const variant of data.variants) {
    const url = clean(variant.image_url);
    if (url) imageSources.push({ url, source: 'product_variations', legacyId: variant.id });
  }
  for (const archive of data.productArchive) {
    const url = clean(archive.image_url);
    if (url) imageSources.push({ url, source: 'product_archive', legacyId: archive.id });
  }
  const uniqueImageSources = [...new Map(imageSources.map((entry) => [entry.url, entry])).values()];

  return {
    products,
    retailProducts,
    canonicalByLegacyId: Object.fromEntries(canonicalByLegacyId),
    imageSources: uniqueImageSources,
    audit: {
      sourceProducts: data.products.length,
      duplicateProductGroupsMerged: duplicateGroups.length,
      preparedLegacyProducts: products.length,
      retailProducts: retailProducts.length,
      totalDestinationProducts: products.length + retailProducts.length,
      productsWithoutMainBarcode: products.filter((row) => !row.barcode).length,
      variants: data.variants.length,
      individuallyBarcodedUnits: data.productBarcodes.length + data.productItems.length,
      categories: data.categories.length,
      archivedRecordsPreserved: data.productArchive.length,
      uniqueImagesToDownload: uniqueImageSources.length,
    },
  };
}

async function writePreparation(prepared) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'audit.json'), `${JSON.stringify(prepared.audit, null, 2)}\n`);
  await writeFile(
    join(outputDir, 'prepared-products.json'),
    `${JSON.stringify([...prepared.products, ...prepared.retailProducts], null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, 'legacy-product-map.json'),
    `${JSON.stringify(prepared.canonicalByLegacyId, null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, 'image-sources.json'),
    `${JSON.stringify(prepared.imageSources, null, 2)}\n`,
  );
}

async function downloadOne(entry) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(entry.url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!mimeType.startsWith('image/')) throw new Error(`unexpected content type ${mimeType}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error('empty response');
      if (bytes.length > 10 * 1024 * 1024) throw new Error(`file exceeds 10 MB (${bytes.length} bytes)`);
      const urlHash = createHash('sha256').update(entry.url).digest('hex');
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      const fileName = `${urlHash}${imageExtension(entry.url, mimeType)}`;
      const path = join(imageDir, fileName);
      try {
        const existing = await stat(path);
        if (existing.size !== bytes.length) await writeFile(path, bytes);
      } catch {
        await writeFile(path, bytes);
      }
      return { ...entry, status: 'downloaded', fileName, mimeType, bytes: bytes.length, contentHash };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  return { ...entry, status: 'failed', error: lastError?.message || String(lastError) };
}

async function downloadImages(prepared) {
  await mkdir(imageDir, { recursive: true });
  const results = Array.from({ length: prepared.imageSources.length });
  let cursor = 0;
  const workerCount = 8;
  async function worker() {
    while (cursor < prepared.imageSources.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await downloadOne(prepared.imageSources[index]);
      if ((index + 1) % 100 === 0) console.log(`Checked ${index + 1}/${prepared.imageSources.length} images`);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const totalBytes = results.reduce((sum, row) => sum + (row.bytes || 0), 0);
  const failed = results.filter((row) => row.status !== 'downloaded');
  const summary = {
    requested: results.length,
    downloaded: results.length - failed.length,
    failed: failed.length,
    totalBytes,
  };
  await writeFile(join(outputDir, 'image-manifest.json'), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(join(outputDir, 'image-download-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) {
    console.error(`Image validation failed for ${failed.length} URL(s). See image-manifest.json.`);
    process.exitCode = 1;
  }
}

const data = await loadData();
const prepared = prepare(data);
await writePreparation(prepared);
console.log(JSON.stringify(prepared.audit, null, 2));

if (command === 'download') {
  await downloadImages(prepared);
} else if (command !== 'audit') {
  throw new Error(`Unknown command: ${command}. Use audit or download.`);
}
