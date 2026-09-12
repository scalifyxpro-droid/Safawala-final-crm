import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) throw new Error('DATABASE_URL is required.');

const sql = postgres(targetUrl, { max: 1, connect_timeout: 15, idle_timeout: 5 });

function psqlCompatible(contents) {
  return contents
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('\\restrict ') && !line.startsWith('\\unrestrict '))
    .join('\n');
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

try {
  const existing = await sql`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;
  if (existing[0].count > 0) {
    throw new Error(
      `Refusing to apply a first-time schema to a database that already has ${existing[0].count} public tables.`,
    );
  }

  const schemaDirectory = path.resolve('railway', 'schema');
  for (const filename of ['001_auth_shim.sql', '002_app_schema.sql']) {
    const contents = psqlCompatible(await fs.readFile(path.join(schemaDirectory, filename), 'utf8'));
    console.log(`Applying ${filename}...`);
    await sql.unsafe(contents);
  }

  const [{ current_user: currentUser }] = await sql`select current_user`;
  await sql.unsafe(`grant authenticated to ${quoteIdentifier(currentUser)}`);
  console.log('Railway schema applied and the application role can assume authenticated.');
} finally {
  await sql.end({ timeout: 5 });
}
