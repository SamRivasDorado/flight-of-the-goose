-- =====================================================================
-- Holidays and personal days off.
--
-- holiday_calendars: a workspace keeps one or more holiday calendars (for example
--   "Comunidad de Madrid", "Madrid city", or a client country), each with a colour.
-- holidays: the days in a calendar (one day, or a range with end_day), with a name.
--   Admins manage calendars and their days; everyone in the workspace sees them.
-- days_off: a person's own days off (holiday, conference...). You add and remove your
--   own; admins can do it for anyone. Everyone in the workspace sees them, so nobody
--   books a meeting or gives a task due on a day someone is away.
-- =====================================================================

create table if not exists holiday_calendars (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 60),
  color         text not null default '#D0453A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at    timestamptz not null default now()
);
create index if not exists holiday_calendars_ws_idx on holiday_calendars (workspace_id);

create table if not exists holidays (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  calendar_id   uuid not null references holiday_calendars on delete cascade,
  day           date not null,
  end_day       date,
  name          text not null default '' check (length(name) <= 80),
  check (end_day is null or end_day >= day)
);
create index if not exists holidays_ws_idx on holidays (workspace_id, day);

create table if not exists days_off (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  member_id     uuid not null references workspace_members on delete cascade,
  start_day     date not null,
  end_day       date not null,
  note          text not null default '' check (length(note) <= 120),
  created_at    timestamptz not null default now(),
  check (end_day >= start_day)
);
create index if not exists days_off_ws_idx on days_off (workspace_id, start_day);

alter table holiday_calendars enable row level security;
alter table holidays enable row level security;
alter table days_off enable row level security;
grant select, insert, update, delete on holiday_calendars, holidays, days_off to authenticated;

drop policy if exists hcal_read on holiday_calendars;
create policy hcal_read on holiday_calendars for select using (in_workspace(workspace_id));
drop policy if exists hcal_write on holiday_calendars;
create policy hcal_write on holiday_calendars for all
  using (my_access(workspace_id) = 'admin') with check (my_access(workspace_id) = 'admin');

drop policy if exists hol_read on holidays;
create policy hol_read on holidays for select using (in_workspace(workspace_id));
drop policy if exists hol_write on holidays;
create policy hol_write on holidays for all
  using (my_access(workspace_id) = 'admin')
  with check (my_access(workspace_id) = 'admin'
    and exists (select 1 from holiday_calendars c where c.id = calendar_id and c.workspace_id = holidays.workspace_id));

drop policy if exists off_read on days_off;
create policy off_read on days_off for select using (in_workspace(workspace_id));
drop policy if exists off_write on days_off;
create policy off_write on days_off for all
  using (member_id = my_member_id(workspace_id) or my_access(workspace_id) = 'admin')
  with check ((member_id = my_member_id(workspace_id) or my_access(workspace_id) = 'admin')
    and exists (select 1 from workspace_members m where m.id = member_id and m.workspace_id = days_off.workspace_id));
