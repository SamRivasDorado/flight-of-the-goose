-- =====================================================================
-- Invite-only sign-up
--
-- New accounts are only created for email addresses that are approved:
--   1. an access request marked 'approved' (see the table access_requests), or
--   2. an address a workspace admin has invited (a workspace_members row that
--      is still open, with no login yet).
-- People who already have an account are not affected.
--
-- The website's "Request access" form calls request_access(); requests wait
-- as 'pending' until the owner sets status = 'approved' (Supabase,
-- Table Editor, access_requests).
-- =====================================================================

create table if not exists access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  name        text not null default '',
  note        text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
-- Nobody reads or writes this table from the browser: requests arrive through
-- request_access(), and the owner decides in the Supabase Table Editor.
alter table access_requests enable row level security;

-- The website form. Anyone may ask; asking twice is harmless; a request that
-- was declined stays declined; an approved one stays approved.
create or replace function request_access(p_email text, p_name text default '', p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email citext := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 200 then
    raise exception 'Enter a valid email address.';
  end if;
  insert into access_requests (email, name, note)
  values (v_email, left(trim(coalesce(p_name, '')), 120), left(trim(coalesce(p_note, '')), 1000))
  on conflict (email) do nothing;
end $$;
revoke all on function request_access(text, text, text) from public;
grant execute on function request_access(text, text, text) to anon, authenticated;

-- May this address get a new account?
create or replace function email_may_sign_up(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from access_requests where email = lower(trim(p_email))::citext and status = 'approved')
      or exists (select 1 from workspace_members where email = lower(trim(p_email))::citext and user_id is null);
$$;
revoke all on function email_may_sign_up(text) from public;

-- The gate: runs before a new login is created.
create or replace function enforce_invite_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not email_may_sign_up(new.email) then
    raise exception 'Goose is invite-only for now. Request access at flightofthegoose.com.';
  end if;
  return new;
end $$;

drop trigger if exists invite_only on auth.users;
create trigger invite_only before insert on auth.users
  for each row execute function enforce_invite_only();
