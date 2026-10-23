-- Minimal stand-ins for what Supabase provides, so the migration and the
-- access tests can run on a plain local Postgres (CI, or `npm run test:db`).
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text not null);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
grant usage on schema auth to authenticated;
