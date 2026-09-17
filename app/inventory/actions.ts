'use server';

import { requireUser } from '@/lib/auth/session';
import { withServiceRole, withUserContext, type Tx } from '@/lib/db/client';
import { getPublicFilePath, uploadFile } from '@/lib/storage/client';

const PRODUCT_IMAGES_BUCKET = 'product-images';

export type InventoryVariant = {
  id: number;
  name: string;
  size: string | null;
  color: string | null;
  material: string | null;
  stock_quantity: number;
  barcode: string | null;
};

export type InventoryProduct = {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  cost_price: number;
  regular_price: number;
  sale_price: number;
  rental_price: number;
  security_deposit: number;
  stock_quantity: number;
  reorder_level: number;
  image_urls: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_variants: InventoryVariant[];
};

const PRODUCT_WITH_VARIANTS_QUERY = `
  select p.id, p.sku, p.barcode, p.name, p.description, p.category, p.subcategory, p.size, p.color,
    p.material, p.cost_price, p.regular_price, p.sale_price, p.rental_price, p.security_deposit,
    p.stock_quantity, p.reorder_level, p.image_urls, p.is_active, p.created_at, p.updated_at,
    coalesce(variants.rows, '[]'::json) as product_variants
  from public.products p
  left join lateral (
    select json_agg(json_build_object(
      'id', pv.id, 'name', pv.name, 'size', pv.size, 'color', pv.color,
      'material', pv.material, 'stock_quantity', pv.stock_quantity, 'barcode', pv.barcode
    )) as rows
    from public.product_variants pv where pv.product_id = p.id
  ) variants on true
  where p.id = $1
`;

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === '23505';
}

type ProductValues = {
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  sku: string | null;
  barcode: string | null;
  cost_price: number;
  regular_price: number;
  sale_price: number;
  rental_price: number;
  security_deposit: number;
  stock_quantity: number;
  reorder_level: number;
  image_urls: string[];
};

async function upsertProduct(
  tx: Tx,
  ownerId: string,
  productId: number | null,
  values: ProductValues,
): Promise<{ id: number }> {
  if (productId) {
    const [row] = await tx.unsafe(
      `update public.products set
        name=$1, description=$2, category=$3, subcategory=$4, size=$5, color=$6, material=$7,
        sku=$8, barcode=$9, cost_price=$10, regular_price=$11, sale_price=$12, rental_price=$13,
        security_deposit=$14, stock_quantity=$15, reorder_level=$16, image_urls=$17, updated_at=now()
      where id=$18
      returning id`,
      [
        values.name, values.description, values.category, values.subcategory, values.size, values.color,
        values.material, values.sku, values.barcode, values.cost_price, values.regular_price, values.sale_price,
        values.rental_price, values.security_deposit, values.stock_quantity, values.reorder_level,
        values.image_urls, productId,
      ],
    );
    return row as unknown as { id: number };
  }
  const [row] = await tx.unsafe(
    `insert into public.products (
      owner_id, name, description, category, subcategory, size, color, material, sku, barcode,
      cost_price, regular_price, sale_price, rental_price, security_deposit, stock_quantity, reorder_level,
      image_urls, is_active
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)
    returning id`,
    [
      ownerId, values.name, values.description, values.category, values.subcategory, values.size, values.color,
      values.material, values.sku, values.barcode, values.cost_price, values.regular_price, values.sale_price,
      values.rental_price, values.security_deposit, values.stock_quantity, values.reorder_level, values.image_urls,
    ],
  );
  return row as unknown as { id: number };
}

async function fetchProductWithVariants(tx: Tx, productId: number): Promise<InventoryProduct> {
  const rows = await tx.unsafe(PRODUCT_WITH_VARIANTS_QUERY, [productId]);
  return (rows as unknown as InventoryProduct[])[0];
}

export async function saveProductAction(
  formData: FormData,
): Promise<{ data: InventoryProduct | null; error: string }> {
  const user = await requireUser();

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const num = (key: string) => Math.max(Number(formData.get(key)) || 0, 0);

  const productId = formData.get('productId') ? Number(formData.get('productId')) : null;
  let existingImageUrls: string[] = [];
  let variantsInput: { id?: number; name: string; size: string; color: string; material: string; stock: string; barcode: string }[] = [];
  try {
    existingImageUrls = JSON.parse(text('existingImageUrls') || '[]');
    variantsInput = JSON.parse(text('variants') || '[]');
  } catch {
    return { data: null, error: 'The product form data was malformed.' };
  }
  const photos = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);

  const imageUrls: string[] = [...existingImageUrls];
  for (const file of photos) {
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await uploadFile(PRODUCT_IMAGES_BUCKET, path, file);
      imageUrls.push(getPublicFilePath(PRODUCT_IMAGES_BUCKET, uploaded.path));
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? `Photo upload failed: ${error.message}` : 'Photo upload failed.',
      };
    }
  }

  const barcode = text('barcode');
  const values: ProductValues = {
    name: text('name'),
    description: text('description') || null,
    category: text('category') || null,
    subcategory: text('subcategory') || null,
    size: text('size') || null,
    color: text('color') || null,
    material: text('material') || null,
    sku: text('sku') || barcode || null,
    barcode: barcode || null,
    cost_price: num('costPrice'),
    regular_price: num('regularPrice'),
    sale_price: num('salePrice'),
    rental_price: num('rentalPrice'),
    security_deposit: num('securityDeposit'),
    stock_quantity: Math.floor(num('stock')),
    reorder_level: Math.floor(num('reorderLevel')),
    image_urls: imageUrls,
  };

  try {
    const result = await withUserContext(user.id, async (tx) => {
      const { id: productRowId } = await upsertProduct(tx, user.id, productId, values);

      const existingVariants = variantsInput.filter(
        (variant): variant is typeof variant & { id: number } => typeof variant.id === 'number',
      );
      const newVariants = variantsInput.filter((variant) => typeof variant.id !== 'number');

      for (const variant of existingVariants) {
        await tx.unsafe(
          `update public.product_variants set name=$1, size=$2, color=$3, material=$4, stock_quantity=$5, barcode=$6
           where id=$7 and product_id=$8`,
          [
            variant.name.trim(),
            variant.size.trim() || null,
            variant.color.trim() || null,
            variant.material.trim() || null,
            Math.floor(Math.max(Number(variant.stock) || 0, 0)),
            variant.barcode || null,
            variant.id,
            productRowId,
          ],
        );
      }
      for (const variant of newVariants) {
        await tx.unsafe(
          `insert into public.product_variants (owner_id, product_id, name, size, color, material, stock_quantity, barcode)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            user.id,
            productRowId,
            variant.name.trim(),
            variant.size.trim() || null,
            variant.color.trim() || null,
            variant.material.trim() || null,
            Math.floor(Math.max(Number(variant.stock) || 0, 0)),
            variant.barcode || null,
          ],
        );
      }
      if (productId) {
        const keptIds = variantsInput.map((variant) => variant.id).filter((id): id is number => typeof id === 'number');
        if (keptIds.length) {
          await tx.unsafe(
            `delete from public.product_variants where product_id = $1 and not (id = any($2::bigint[]))`,
            [productRowId, keptIds],
          );
        } else {
          await tx.unsafe(`delete from public.product_variants where product_id = $1`, [productRowId]);
        }
      }

      return fetchProductWithVariants(tx, productRowId);
    });
    return { data: result, error: '' };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { data: null, error: 'This barcode or SKU is already assigned to another product.' };
    }
    return { data: null, error: error instanceof Error ? error.message : 'Product could not be saved.' };
  }
}

export type ImportProductValues = {
  name: string;
  barcode: string | null;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  cost_price: number;
  regular_price: number;
  sale_price: number;
  rental_price: number;
  security_deposit: number;
  stock_quantity: number;
  reorder_level: number;
  is_active: boolean;
};

export async function importProductAction(
  existingId: number | null,
  values: ImportProductValues,
): Promise<{ data: InventoryProduct | null; error: string }> {
  try {
    const user = await requireUser();
    const result = await withUserContext(user.id, async (tx) => {
      let resolvedExistingId = existingId;
      if (!resolvedExistingId && (values.barcode || values.sku)) {
        const matches = await tx.unsafe(
          `select id from public.products
           where owner_id = $1
             and (($2::text is not null and barcode = $2) or ($3::text is not null and sku = $3))
           order by id
           limit 1`,
          [user.id, values.barcode, values.sku],
        );
        resolvedExistingId = Number(
          (matches[0] as { id?: number } | undefined)?.id ?? 0,
        ) || null;
      }

      let productRowId: number;
      if (resolvedExistingId) {
        const [row] = await tx.unsafe(
          `update public.products set
            name=$1, barcode=$2, sku=$3, category=$4, subcategory=$5, size=$6, color=$7, material=$8,
            cost_price=$9, regular_price=$10, sale_price=$11, rental_price=$12, security_deposit=$13,
            stock_quantity=$14, reorder_level=$15, is_active=$16, updated_at=now()
          where id=$17
          returning id`,
          [
            values.name, values.barcode, values.sku, values.category, values.subcategory, values.size,
            values.color, values.material, values.cost_price, values.regular_price, values.sale_price,
            values.rental_price, values.security_deposit, values.stock_quantity, values.reorder_level,
            values.is_active, resolvedExistingId,
          ],
        );
        productRowId = (row as unknown as { id: number }).id;
      } else {
        const [row] = await tx.unsafe(
          `insert into public.products (
            owner_id, name, barcode, sku, category, subcategory, size, color, material,
            cost_price, regular_price, sale_price, rental_price, security_deposit,
            stock_quantity, reorder_level, is_active
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          returning id`,
          [
            user.id, values.name, values.barcode, values.sku, values.category, values.subcategory, values.size,
            values.color, values.material, values.cost_price, values.regular_price, values.sale_price,
            values.rental_price, values.security_deposit, values.stock_quantity, values.reorder_level,
            values.is_active,
          ],
        );
        productRowId = (row as unknown as { id: number }).id;
      }
      return fetchProductWithVariants(tx, productRowId);
    });
    return { data: result, error: '' };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { data: null, error: 'This barcode or SKU is already assigned to another product.' };
    }
    return { data: null, error: error instanceof Error ? error.message : 'Product could not be imported.' };
  }
}

export async function updateProductStatusAction(
  productId: number,
  isActive: boolean,
): Promise<{ error: string }> {
  try {
    const user = await requireUser();
    await withUserContext(user.id, (tx) => tx`
      update public.products set is_active = ${isActive} where id = ${productId}
    `);
    return { error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Product status could not be updated.' };
  }
}

export async function deleteProductAction(productId: number): Promise<{ error: string }> {
  try {
    if (!Number.isSafeInteger(productId) || productId <= 0) return { error: 'Invalid product ID.' };
    const user = await requireUser();
    const [profile] = await withUserContext(user.id, (tx) => tx<{ role: string }[]>`
      select role from public.profiles where id = ${user.id}
    `);
    if (profile?.role !== 'admin') return { error: 'Only an administrator can delete inventory products.' };

    await withServiceRole(async (tx) => {
      const [product] = await tx<{ id: number }[]>`
        select id from public.products
        where id = ${productId} and owner_id = ${user.id}
        for update
      `;
      if (!product) throw new Error('Product not found. Refresh inventory and try again.');

      // Booking items keep their recorded name, quantity and price; only the
      // live catalogue reference is removed. Packages cannot retain a deleted
      // product, so remove that package membership in the same transaction.
      await tx`
        update public.booking_items set product_id = null
        where product_id = ${productId} and owner_id = ${user.id}
      `;
      await tx`
        delete from public.package_items
        where product_id = ${productId} and owner_id = ${user.id}
      `;
      await tx`
        delete from public.products
        where id = ${productId} and owner_id = ${user.id}
      `;
    });
    return { error: '' };
  } catch (error) {
    return { error: (error as { code?: string })?.code === '23503'
      ? 'This product is still used by another record and cannot be deleted safely.'
      : error instanceof Error ? error.message : 'Product could not be deleted.' };
  }
}
