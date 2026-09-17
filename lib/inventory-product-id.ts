const MAX_POSTGRES_BIGINT = '9223372036854775807';

/** Postgres bigint IDs can arrive in client components as decimal strings. */
export function normalizeInventoryProductId(value: number | string): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  const id = value.trim();
  if (!/^[1-9]\d*$/.test(id)) return null;
  if (id.length > MAX_POSTGRES_BIGINT.length) return null;
  if (id.length === MAX_POSTGRES_BIGINT.length && id > MAX_POSTGRES_BIGINT) return null;
  return id;
}
