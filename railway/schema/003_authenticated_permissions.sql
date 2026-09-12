-- Runtime grants for the role used by withUserContext(). Row Level Security
-- remains responsible for restricting each request to its authenticated user.
-- Keep this after 002_app_schema.sql so every table, sequence, and function
-- created by the imported schema is included.

grant usage on schema public, auth to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage, select, update
  on all sequences in schema public
  to authenticated;

grant execute
  on all functions in schema public
  to authenticated;

grant execute
  on all functions in schema auth
  to authenticated;

-- Preserve the same permissions for later migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select, update on sequences to authenticated;

alter default privileges in schema public
  grant execute on functions to authenticated;
