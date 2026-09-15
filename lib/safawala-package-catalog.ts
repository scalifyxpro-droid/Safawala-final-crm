import 'server-only';

import { withUserContext } from '@/lib/db/client';

/**
 * The database owns the supplied workbook catalogue. Calling its idempotent
 * sync function here also gives newly created administrators the same data.
 */
export async function ensureSafawalaPackageCatalog(ownerId: string) {
  await withUserContext(
    ownerId,
    (tx) => tx`select public.ensure_safawala_package_catalog(${ownerId})`,
  );
}
