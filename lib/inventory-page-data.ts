import type { InventoryProduct } from '@/components/inventory/inventory-directory';
import { withUserContext } from '@/lib/db/client';
import {
  getUpcomingReservations,
  type ProductReservation,
} from '@/lib/inventory-availability';

export const INVENTORY_PAGE_SIZES = [10, 25, 50, 100] as const;

export type InventoryStockFilter =
  | 'all'
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock';

export type InventoryPageQuery = {
  page: number;
  pageSize: number;
  search: string;
  category: string;
  subcategory: string;
  stock: InventoryStockFilter;
  archived: boolean;
};

export type InventorySummary = {
  activeCount: number;
  archivedCount: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  inventoryValue: number;
};

export type InventoryPageData = {
  products: InventoryProduct[];
  reservations: ProductReservation[];
  total: number;
  page: number;
  summary: InventorySummary;
  subcategories: string[];
};

const FILTER_SQL = `
  p.is_active = $1
  and ($2 = '' or concat_ws(' ', p.name, p.barcode, p.sku, p.category, p.subcategory) ilike '%' || $2 || '%')
  and ($3 = 'all' or lower(trim(coalesce(p.category, ''))) = lower(trim($3)))
  and ($4 = 'all' or lower(trim(coalesce(p.subcategory, ''))) = lower(trim($4)))
  and (
    $5 = 'all'
    or ($5 = 'in_stock' and p.stock_quantity > p.reorder_level)
    or ($5 = 'low_stock' and p.stock_quantity > 0 and p.stock_quantity <= p.reorder_level)
    or ($5 = 'out_of_stock' and p.stock_quantity = 0)
  )
`;

export function normalizeInventoryPageQuery(
  input: Partial<InventoryPageQuery>,
): InventoryPageQuery {
  const requestedSize = Number(input.pageSize);
  const pageSize = INVENTORY_PAGE_SIZES.includes(
    requestedSize as (typeof INVENTORY_PAGE_SIZES)[number],
  )
    ? requestedSize
    : 10;
  const allowedStockFilters: InventoryStockFilter[] = [
    'all',
    'in_stock',
    'low_stock',
    'out_of_stock',
  ];

  return {
    page: Math.max(1, Math.floor(Number(input.page) || 1)),
    pageSize,
    search: String(input.search ?? '').trim().slice(0, 120),
    category: String(input.category ?? 'all').trim() || 'all',
    subcategory: String(input.subcategory ?? 'all').trim() || 'all',
    stock: allowedStockFilters.includes(input.stock as InventoryStockFilter)
      ? (input.stock as InventoryStockFilter)
      : 'all',
    archived: Boolean(input.archived),
  };
}

export async function getInventoryPageData(
  userId: string,
  input: Partial<InventoryPageQuery>,
): Promise<InventoryPageData> {
  const query = normalizeInventoryPageQuery(input);
  const filterParams = [
    !query.archived,
    query.search,
    query.category,
    query.subcategory,
    query.stock,
  ];

  const { total, page, products, summary, subcategories } = await withUserContext(
    userId,
    async (tx) => {
      const [countRows, summaryRows, subcategoryRows] = await Promise.all([
        tx.unsafe(`select count(*)::int as total from public.products p where ${FILTER_SQL}`, filterParams),
        tx.unsafe(`
          select
            count(*) filter (where is_active)::int as "activeCount",
            count(*) filter (where not is_active)::int as "archivedCount",
            count(*) filter (where is_active and stock_quantity > reorder_level)::int as "inStock",
            count(*) filter (where is_active and stock_quantity > 0 and stock_quantity <= reorder_level)::int as "lowStock",
            count(*) filter (where is_active and stock_quantity = 0)::int as "outOfStock",
            coalesce(sum(sale_price * stock_quantity) filter (where is_active), 0)::float8 as "inventoryValue"
          from public.products
        `),
        tx.unsafe(
          `select distinct subcategory from public.products
           where is_active = $1 and subcategory is not null and trim(subcategory) <> ''
             and ($2 = 'all' or lower(trim(coalesce(category, ''))) = lower(trim($2)))
           order by subcategory`,
          [!query.archived, query.category],
        ),
      ]);

      const total = Number((countRows[0] as { total?: number } | undefined)?.total ?? 0);
      const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
      const page = Math.min(query.page, pageCount);
      const offset = (page - 1) * query.pageSize;
      const productRows = await tx.unsafe(
        `
          with selected_products as (
            select p.* from public.products p
            where ${FILTER_SQL}
            order by p.created_at desc, p.id desc
            limit $6 offset $7
          )
          select
            p.id, p.sku, p.barcode, p.name, p.description, p.category, p.subcategory, p.size, p.color,
            p.material, p.cost_price, p.regular_price, p.sale_price, p.rental_price, p.security_deposit,
            p.stock_quantity, p.reorder_level, p.image_urls, p.is_active, p.created_at, p.updated_at,
            coalesce(variants.rows, '[]'::json) as product_variants
          from selected_products p
          left join lateral (
            select json_agg(json_build_object(
              'id', pv.id, 'name', pv.name, 'size', pv.size, 'color', pv.color,
              'material', pv.material, 'stock_quantity', pv.stock_quantity, 'barcode', pv.barcode
            )) as rows
            from public.product_variants pv where pv.product_id = p.id
          ) variants on true
          order by p.created_at desc, p.id desc
        `,
        [...filterParams, query.pageSize, offset],
      );

      const rawSummary = (summaryRows[0] ?? {}) as Partial<InventorySummary>;
      return {
        total,
        page,
        products: productRows as unknown as InventoryProduct[],
        summary: {
          activeCount: Number(rawSummary.activeCount ?? 0),
          archivedCount: Number(rawSummary.archivedCount ?? 0),
          inStock: Number(rawSummary.inStock ?? 0),
          lowStock: Number(rawSummary.lowStock ?? 0),
          outOfStock: Number(rawSummary.outOfStock ?? 0),
          inventoryValue: Number(rawSummary.inventoryValue ?? 0),
        },
        subcategories: subcategoryRows
          .map((row) => String((row as { subcategory?: string }).subcategory ?? ''))
          .filter(Boolean),
      };
    },
  );

  const reservations = products.length
    ? await getUpcomingReservations({
        ownerId: userId,
        productIds: products.map((product) => product.id),
        fromDate: new Date().toISOString().slice(0, 10),
      }).catch(() => [])
    : [];

  return { products, reservations, total, page, summary, subcategories };
}
