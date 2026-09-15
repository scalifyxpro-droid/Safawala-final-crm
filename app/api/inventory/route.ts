import { type NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import {
  getInventoryPageData,
  normalizeInventoryPageQuery,
} from '@/lib/inventory-page-data';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const params = request.nextUrl.searchParams;
    const query = normalizeInventoryPageQuery({
      page: Number(params.get('page')),
      pageSize: Number(params.get('pageSize')),
      search: params.get('search') ?? '',
      category: params.get('category') ?? 'all',
      subcategory: params.get('subcategory') ?? 'all',
      stock: params.get('stock') as never,
      archived: params.get('archived') === 'true',
    });
    return NextResponse.json(await getInventoryPageData(user.id, query));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to load inventory.',
      },
      { status: 500 },
    );
  }
}
