import postgres from 'postgres';

/**
 * Railway Postgres connection pool, replacing every `@supabase/supabase-js`
 * client (`lib/supabase/client.ts`, `server.ts`, `admin.ts`).
 *
 * Requires `DATABASE_URL` (Railway injects this automatically when a
 * Postgres service is linked to this app service).
 */

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: postgres.Sql | undefined;
}

function getPool(): postgres.Sql {
  if (globalThis.__pgPool) return globalThis.__pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Link the Railway Postgres service to this app.',
    );
  }

  const pool = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Reuse the pool across hot reloads in dev / across serverless invocations.
  globalThis.__pgPool = pool;
  return pool;
}

export type Tx = postgres.TransactionSql;
export type DbParameter = postgres.ParameterOrJSON<never>;

/**
 * Runs `fn` inside a transaction with the Postgres session configured so
 * every existing RLS policy (`owner_id = auth.uid()`, `for all to
 * authenticated`, etc. — unchanged from the original Supabase schema) is
 * enforced exactly as it was against Supabase.
 *
 * - `userId` becomes `auth.uid()` for the duration of the transaction.
 * - The DB connection must be a role that (a) does NOT own the application
 *   tables (so it does not automatically bypass RLS) and (b) IS a member of
 *   the `authenticated` Postgres role (so `set local role authenticated` is
 *   permitted). See railway/schema/001_auth_shim.sql for the one-time
 *   `grant authenticated to <app_db_user>;` this depends on.
 *
 * Verified against a local schema replay: forgetting to call this (or a
 * user_id of null) makes every RLS-protected table return zero rows rather
 * than leaking data — the pattern fails closed, not open.
 */
export async function withUserContext<T>(
  userId: string | null,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return (await getPool().begin(async (tx) => {
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('app.user_id', ${userId ?? ''}, true)`;
    return fn(tx);
  })) as T;
}

/**
 * Runs `fn` with the base (table-owner) connection role, which bypasses RLS
 * entirely — the equivalent of the old `createAdminClient()` / service-role
 * client. Use ONLY for trusted server-side admin operations, never for
 * anything driven by a request's own user context.
 */
export async function withServiceRole<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await getPool().begin(async (tx) => fn(tx))) as T;
}
