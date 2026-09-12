import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { withUserContext } from '@/lib/db/client';

type ProductRow = {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  sale_price: number;
  rental_price: number;
  security_deposit: number;
  stock_quantity: number;
  image_urls: string[];
};

const PRODUCT_FIELDS =
  'id, sku, barcode, name, category, subcategory, sale_price, rental_price, security_deposit, stock_quantity, image_urls';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Your session has expired.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const barcode = String(body?.barcode ?? '').trim();
    if (!barcode) return NextResponse.json({ error: 'Barcode is required.' }, { status: 422 });

    const product = await withUserContext(user.id, async (tx) => {
      const [byBarcode] = await tx.unsafe(
        `select ${PRODUCT_FIELDS} from public.products where barcode = $1 and is_active = true limit 1`,
        [barcode],
      );
      if (byBarcode) return byBarcode as unknown as ProductRow;

      const [bySku] = await tx.unsafe(
        `select ${PRODUCT_FIELDS} from public.products where sku = $1 and is_active = true limit 1`,
        [barcode],
      );
      if (bySku) return bySku as unknown as ProductRow;

      const [variant] = await tx.unsafe(
        `select product_id from public.product_variants where barcode = $1 limit 1`,
        [barcode],
      );
      const variantProductId = (variant as unknown as { product_id: number } | undefined)?.product_id;
      if (variantProductId) {
        const [byVariant] = await tx.unsafe(
          `select ${PRODUCT_FIELDS} from public.products where id = $1 and is_active = true limit 1`,
          [variantProductId],
        );
        if (byVariant) return byVariant as unknown as ProductRow;
      }
      return null;
    });

    if (!product) return NextResponse.json({ error: `No product found with barcode: ${barcode}` }, { status: 404 });
    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to lookup barcode.' }, { status: 500 });
  }
}
