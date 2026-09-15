import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('DATABASE_URL is not set; skipping Railway database migrations.');
  process.exit(0);
}

const migrations = [
  'supabase/migrations/20260915090000_package_catalog_details.sql',
  'supabase/migrations/20260915143000_accounts_manager_portals.sql',
  'supabase/migrations/20260915181133_settings_profile_banking.sql',
  'supabase/migrations/20260916001000_accounts_portal_exact_access.sql',
  'supabase/migrations/20260916100000_whatsapp_automation.sql',
];
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});

try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('safawala_railway_migrations'))`;
    await tx`
      create table if not exists public.railway_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    for (const filename of migrations) {
      const [applied] = await tx`
        select exists(
          select 1 from public.railway_migrations where filename = ${filename}
        ) as exists
      `;
      if (applied.exists) continue;

      const contents = await fs.readFile(path.resolve(filename), 'utf8');
      console.log(`Applying ${filename}...`);
      await tx.unsafe(contents);
      await tx`
        insert into public.railway_migrations (filename) values (${filename})
      `;
    }
  });
} finally {
  await sql.end({ timeout: 5 });
}
