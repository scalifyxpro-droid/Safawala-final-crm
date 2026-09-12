-- Railway replacement for Supabase Auth (GoTrue).
-- Provides a real `auth` schema with a `users` table and `auth.uid()` /
-- `auth.role()` functions so that every existing RLS policy and the ~150
-- `auth.users` / `auth.uid()` / `auth.role()` references already present in
-- the public-schema migrations keep working completely unchanged.
--
-- How request-scoped identity works (no GoTrue, no JWT verification inside
-- Postgres): the app authenticates the user itself (bcrypt + our own signed
-- session cookie, see lib/auth/*), then for every database transaction that
-- must respect RLS it runs:
--
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('app.user_id', '<uuid-of-signed-in-user>', true);
--
-- `auth.uid()` reads that transaction-local setting. `SET LOCAL` values are
-- automatically cleared at COMMIT/ROLLBACK, so there is no risk of one
-- request's identity leaking into a pooled connection's next transaction.
--
-- Administrative/service-role work (the old `createAdminClient()` usage)
-- simply does NOT switch role — the base connection role owns every table,
-- and table owners bypass RLS by default (matching Supabase's service_role
-- behaviour), so no separate bypass flag is needed.

create extension if not exists pgcrypto;

create schema if not exists auth;

-- `create table if not exists` here is deliberately additive: it must not
-- clobber the real auth.users table (and its ~40 incoming foreign keys, plus
-- the `on_auth_user_created` trigger that already populates `profiles`) once
-- real data lives in it. Missing columns are added with `alter ... add
-- column if not exists` instead of a destructive recreate.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists email_confirmed_at timestamptz not null default now();
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists updated_at timestamptz not null default now();
-- Existing rows (if any were seeded as part of schema replay/testing) won't
-- have a password yet; real rows are always inserted with one by the
-- migration script / signup code, so NOT NULL is enforced going forward only.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'users_encrypted_password_not_null'
  ) then
    alter table auth.users add constraint users_encrypted_password_not_null
      check (encrypted_password is not null) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_email_key'
  ) then
    alter table auth.users add constraint users_email_key unique (email);
  end if;
end $$;

create index if not exists auth_users_email_idx on auth.users (lower(email));

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('role', true), ''), 'authenticated')
$$;

-- Postgres roles referenced by every `grant ... to authenticated` and
-- `for all to authenticated` clause in the existing migrations.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;

-- IMPORTANT (deployment step, not run automatically): the application's
-- connecting Postgres user must itself own every table in `public` (so it
-- bypasses RLS as "service role" by default) AND be a member of
-- `authenticated` (so `SET LOCAL ROLE authenticated` inside a request
-- transaction is allowed):
--
--   grant authenticated to <app_db_user>;
