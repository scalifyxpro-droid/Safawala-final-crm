import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withServiceRole } from '@/lib/db/client';
import { getPublicFilePath, uploadFile } from '@/lib/storage/client';

const PRODUCT_IMAGES_BUCKET = 'product-images';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Your session has expired.' }, { status: 401 });
    }

    const isMultipart = request.headers.get('content-type')?.includes('multipart/form-data') ?? false;
    const body = isMultipart ? await request.formData() : await request.json();
    const read = (key: string) => (body instanceof FormData ? body.get(key) : body[key]);
    const ownerIdValue = read('ownerId');
    const ownerId = typeof ownerIdValue === 'string' && ownerIdValue ? ownerIdValue : user.id;
    const name = String(read('name') ?? '').trim();
    const category = String(read('category') ?? '').trim();
    if (!name || !category) {
      return NextResponse.json({ error: 'Product name and category are required.' }, { status: 422 });
    }

    let imageUrls: string[] = [];
    const imageFile = isMultipart ? read('image') : null;
    if (imageFile instanceof File && imageFile.size > 0) {
      try {
        const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${ownerId}/${Date.now()}-${safeName}`;
        const uploaded = await uploadFile(PRODUCT_IMAGES_BUCKET, path, imageFile);
        imageUrls = [getPublicFilePath(PRODUCT_IMAGES_BUCKET, uploaded.path)];
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? `Image upload failed: ${error.message}` : 'Image upload failed.' },
          { status: 400 },
        );
      }
    } else if (!isMultipart && Array.isArray(body.image_urls)) {
      imageUrls = body.image_urls;
    }

    const sku = read('sku') ? String(read('sku')).trim() : null;
    const salePrice = Number(read('sale_price') ?? 0);
    const rentalPrice = Number(read('rental_price') ?? 0);
    const stockQuantity = Number(read('stock_quantity') ?? 0);

    try {
      const [product] = await withServiceRole((tx) => tx`
        insert into public.products (owner_id, name, sku, category, sale_price, rental_price, stock_quantity, image_urls)
        values (${ownerId}, ${name}, ${sku}, ${category}, ${salePrice}, ${rentalPrice}, ${stockQuantity}, ${tx.array(imageUrls)})
        returning id, sku, barcode, name, category, subcategory, sale_price, rental_price, security_deposit, stock_quantity, image_urls
      `);
      return NextResponse.json({ product, inventoryAdded: true });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const errorMessage =
        code === '23505'
          ? 'That SKU is already used in this inventory. Enter a unique SKU.'
          : error instanceof Error
            ? error.message
            : 'Unable to save the product.';
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save the product.' },
      { status: 500 },
    );
  }
}
