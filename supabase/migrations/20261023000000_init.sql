-- =====================================================================
-- {{APP_NAME}} — initial schema
-- Everything belongs to a workspace. People inside a workspace are
-- "members" (rows in workspace_members); a member may be linked to a
-- login (auth.users) or still be an open invitation.
-- Visibility rules (see docs/teams-and-access.md) are enforced here with
-- row-level security, so the browser never receives data a person may
-- not see.
-- =====================================================================

create extension if not exists citext;

-- ---------- enums --------------------------------------------------------
create type access_level   as enum ('admin','manager','member','guest');
create type member_status  as enum ('invited','active');
create type project_kind   as enum ('fixed','ongoing');
create type project_status as enum ('active','paused','closed');
create type task_status    as enum ('todo','doing','done');
create type goal_status    as enum ('on_track','at_risk','off_track','achieved');
create type note_kind      as enum ('note','meeting','decision');
create type field_type     as enum ('select','text','number','date');

-- ---------- accounts and workspaces --------------------------------------
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

-- A person in a workspace. user_id is null until an invitation is accepted.
create table workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  user_id       uuid references auth.users on delete set null,
  email         citext not null,
  display_name  text not null,
  title         text not null default '',
  access        access_level not null default 'member',
  status        member_status not null default 'invited',
  color         text not null default '#5B83B5',
  invited_by    uuid references workspace_members on delete set null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, email),
  unique (workspace_id, user_id)
);

create table teams (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces on delete cascade,
  name            text not null,
  color           text not null,
  image_path      text,
  lead_member_id  uuid references workspace_members on delete set null,
  created_at      timestamptz not null default now()
);

create table team_members (
  team_id    uuid not null references teams on delete cascade,
  member_id  uuid not null references workspace_members on delete cascade,
  primary key (team_id, member_id)
);

-- ---------- dimensions and custom fields ----------------------------------
-- is_dimension = shared label used by the Lens and charts (Priority, Region, …)
-- otherwise an extra field that individual projects switch on.
create table fields (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  name          text not null,
  type          field_type not null default 'select',
  is_dimension  boolean not null default true,
  builtin       boolean not null default false,
  position      int not null default 0
);

create table field_options (
  id            uuid primary key default gen_random_uuid(),
  field_id      uuid not null references fields on delete cascade,
  workspace_id  uuid not null references workspaces on delete cascade,
  label         text not null,
  color         text not null,
  position      int not null default 0
);

-- ---------- strategy, projects, tasks --------------------------------------
create table goals (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces on delete cascade,
  parent_id        uuid references goals on delete cascade,
  title            text not null,
  start_date       date not null default current_date,
  end_date         date,                          -- null = open-ended
  status           goal_status not null default 'on_track',
  manual_progress  int not null default 0 check (manual_progress between 0 and 100),
  notes            text not null default '',
  owner_member_id  uuid references workspace_members on delete set null,
  created_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table projects (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces on delete cascade,
  name             text not null,
  color            text not null,
  icon             text not null default 'folder',
  image_path       text,
  image_fit        text not null default 'fit' check (image_fit in ('fit','fill')),
  kind             project_kind not null default 'ongoing',
  status           project_status not null default 'active',
  start_date       date,
  end_date         date,
  owner_member_id  uuid references workspace_members on delete set null,
  created_at       timestamptz not null default now()
);

create table project_members (
  project_id  uuid not null references projects on delete cascade,
  member_id   uuid not null references workspace_members on delete cascade,
  primary key (project_id, member_id)
);

create table project_teams (
  project_id  uuid not null references projects on delete cascade,
  team_id     uuid not null references teams on delete cascade,
  primary key (project_id, team_id)
);

create table goal_projects (
  goal_id     uuid not null references goals on delete cascade,
  project_id  uuid not null references projects on delete cascade,
  primary key (goal_id, project_id)
);

create table project_defaults (           -- default dimension values per project
  project_id  uuid not null references projects on delete cascade,
  field_id    uuid not null references fields on delete cascade,
  option_id   uuid not null references field_options on delete cascade,
  primary key (project_id, field_id)
);

create table project_fields (             -- extra (non-dimension) fields a project uses
  project_id  uuid not null references projects on delete cascade,
  field_id    uuid not null references fields on delete cascade,
  primary key (project_id, field_id)
);

create table notes (                      -- project notebook entries
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces on delete cascade,
  project_id         uuid not null references projects on delete cascade,
  entry_date         date not null default current_date,
  kind               note_kind not null default 'note',
  body               text not null,
  created_by_member  uuid references workspace_members on delete set null,
  created_at         timestamptz not null default now()
);

create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces on delete cascade,
  project_id          uuid references projects on delete set null,
  goal_id             uuid references goals on delete set null,
  title               text not null default '',
  description         text not null default '',
  due_date            date,
  status              task_status not null default 'todo',
  completed_at        date,
  hours               numeric(7,2) check (hours is null or hours >= 0),
  assignee_member_id  uuid references workspace_members on delete set null,
  created_by_member   uuid references workspace_members on delete set null,
  source_note_id      uuid references notes on delete set null,
  source_line         int,
  created_at          timestamptz not null default now()
);

create table task_collaborators (
  task_id    uuid not null references tasks on delete cascade,
  member_id  uuid not null references workspace_members on delete cascade,
  primary key (task_id, member_id)
);

create table task_values (                -- dimension and extra-field values set on the task itself
  task_id    uuid not null references tasks on delete cascade,
  field_id   uuid not null references fields on delete cascade,
  option_id  uuid references field_options on delete cascade,
  value      text,
  primary key (task_id, field_id)
);

create table subtasks (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references tasks on delete cascade,
  title     text not null,
  done      boolean not null default false,
  position  int not null default 0
);

-- Per-person preferences inside a workspace (palette, week start, saved charts)
create table member_settings (
  member_id  uuid primary key references workspace_members on delete cascade,
  settings   jsonb not null default '{}'::jsonb
);

-- ---------- indexes ----------------------------------------------------------
create index on workspace_members (user_id);
create index on tasks (workspace_id, due_date);
create index on tasks (project_id);
create index on tasks (assignee_member_id);
create index on tasks (goal_id);
create index on projects (workspace_id);
create index on goals (workspace_id);
create index on notes (project_id, entry_date);
create index on team_members (member_id);
create index on project_members (member_id);

-- =====================================================================
-- Helper functions used by the security rules.
-- security definer + fixed search_path so they can read membership tables
-- without triggering the policies again (no recursion).
-- =====================================================================
create or replace function my_member_id(ws uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from workspace_members
  where workspace_id = ws and user_id = auth.uid() and status = 'active'
$$;

create or replace function my_access(ws uuid) returns access_level
language sql stable security definer set search_path = public as $$
  select access from workspace_members
  where workspace_id = ws and user_id = auth.uid() and status = 'active'
$$;

create or replace function in_workspace(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_member_id(ws) is not null
$$;

-- Admins and managers see everything in the workspace.
create or replace function sees_all(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_access(ws) in ('admin','manager'), false)
$$;

create or replace function can_edit(ws uuid) returns boolean   -- everyone but guests
language sql stable security definer set search_path = public as $$
  select coalesce(my_access(ws) in ('admin','manager','member'), false)
$$;

create or replace function can_see_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = pid and (
      sees_all(p.workspace_id)
      or p.owner_member_id = my_member_id(p.workspace_id)
      or exists (select 1 from project_members pm where pm.project_id = p.id and pm.member_id = my_member_id(p.workspace_id))
      or exists (select 1 from project_teams pt join team_members tm on tm.team_id = pt.team_id
                 where pt.project_id = p.id and tm.member_id = my_member_id(p.workspace_id))
    )
  )
$$;

create or replace function can_see_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t
    left join goals g  on g.id = t.goal_id
    left join goals gp on gp.id = g.parent_id
    where t.id = tid and (
      sees_all(t.workspace_id)
      or t.assignee_member_id = my_member_id(t.workspace_id)
      or t.created_by_member  = my_member_id(t.workspace_id)
      or exists (select 1 from task_collaborators c where c.task_id = t.id and c.member_id = my_member_id(t.workspace_id))
      or (t.project_id is not null and can_see_project(t.project_id))
      or g.owner_member_id  = my_member_id(t.workspace_id)
      or gp.owner_member_id = my_member_id(t.workspace_id)
    )
  )
$$;

create or replace function can_see_goal(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from goals g
    left join goals gp on gp.id = g.parent_id
    where g.id = gid and (
      sees_all(g.workspace_id)
      or g.owner_member_id  = my_member_id(g.workspace_id)
      or gp.owner_member_id = my_member_id(g.workspace_id)
      or exists (select 1 from goal_projects gpj where gpj.goal_id = g.id and can_see_project(gpj.project_id))
      or exists (select 1 from tasks t where t.goal_id = g.id and can_see_task(t.id))
      -- a top-level goal is visible when one of its sub-goals is
      or exists (select 1 from goals k where k.parent_id = g.id and (
           k.owner_member_id = my_member_id(g.workspace_id)
           or exists (select 1 from goal_projects kp where kp.goal_id = k.id and can_see_project(kp.project_id))
           or exists (select 1 from tasks kt where kt.goal_id = k.id and can_see_task(kt.id))))
    )
  )
$$;

create or replace function can_manage_project(pid uuid) returns boolean   -- manager+, or the project owner
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.id = pid and
    (sees_all(p.workspace_id) or p.owner_member_id = my_member_id(p.workspace_id)))
$$;

create or replace function ws_of_task(tid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select workspace_id from tasks where id = tid $$;
create or replace function ws_of_project(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select workspace_id from projects where id = pid $$;
create or replace function ws_of_team(tid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select workspace_id from teams where id = tid $$;
create or replace function ws_of_goal(gid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select workspace_id from goals where id = gid $$;
create or replace function ws_of_field(fid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select workspace_id from fields where id = fid $$;

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table profiles           enable row level security;
alter table workspaces         enable row level security;
alter table workspace_members  enable row level security;
alter table teams              enable row level security;
alter table team_members       enable row level security;
alter table fields             enable row level security;
alter table field_options      enable row level security;
alter table goals              enable row level security;
alter table projects           enable row level security;
alter table project_members    enable row level security;
alter table project_teams      enable row level security;
alter table goal_projects      enable row level security;
alter table project_defaults   enable row level security;
alter table project_fields     enable row level security;
alter table notes              enable row level security;
alter table tasks              enable row level security;
alter table task_collaborators enable row level security;
alter table task_values        enable row level security;
alter table subtasks           enable row level security;
alter table member_settings    enable row level security;

-- profiles: you read and edit your own
create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- workspaces: members read; admins rename
create policy ws_read   on workspaces for select using (in_workspace(id));
create policy ws_update on workspaces for update using (my_access(id) = 'admin');

-- people: everyone in the workspace sees the list; admins invite, edit and remove
create policy wm_read  on workspace_members for select using (in_workspace(workspace_id));
create policy wm_write on workspace_members for all
  using (my_access(workspace_id) = 'admin') with check (my_access(workspace_id) = 'admin');

-- teams: visible to all members; managers create; admins or the lead edit; admins delete
create policy teams_read   on teams for select using (in_workspace(workspace_id));
create policy teams_insert on teams for insert with check (sees_all(workspace_id));
create policy teams_update on teams for update
  using (my_access(workspace_id) = 'admin' or lead_member_id = my_member_id(workspace_id));
create policy teams_delete on teams for delete using (my_access(workspace_id) = 'admin');

create policy tm_read  on team_members for select using (in_workspace(ws_of_team(team_id)));
create policy tm_write on team_members for all
  using (my_access(ws_of_team(team_id)) = 'admin'
         or exists (select 1 from teams t where t.id = team_id and t.lead_member_id = my_member_id(t.workspace_id)))
  with check (my_access(ws_of_team(team_id)) = 'admin'
         or exists (select 1 from teams t where t.id = team_id and t.lead_member_id = my_member_id(t.workspace_id)));

-- dimensions and fields: everyone reads; managers and admins change
create policy fields_read  on fields for select using (in_workspace(workspace_id));
create policy fields_write on fields for all using (sees_all(workspace_id)) with check (sees_all(workspace_id));
create policy fo_read  on field_options for select using (in_workspace(workspace_id));
create policy fo_write on field_options for all using (sees_all(workspace_id)) with check (sees_all(workspace_id));

-- goals: visibility rule; managers and admins create, edit, delete
create policy goals_read  on goals for select using (can_see_goal(id));
create policy goals_write on goals for all using (sees_all(workspace_id)) with check (sees_all(workspace_id));

create policy gp_read  on goal_projects for select using (can_see_goal(goal_id));
create policy gp_write on goal_projects for all
  using (sees_all(ws_of_goal(goal_id)) or can_manage_project(project_id))
  with check (sees_all(ws_of_goal(goal_id)) or can_manage_project(project_id));

-- projects: visibility rule; managers create and delete; managers or owner edit
create policy projects_read   on projects for select using (can_see_project(id));
create policy projects_insert on projects for insert with check (sees_all(workspace_id));
create policy projects_update on projects for update using (can_manage_project(id));
create policy projects_delete on projects for delete using (sees_all(workspace_id));

create policy pm_read  on project_members  for select using (can_see_project(project_id));
create policy pm_write on project_members  for all using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy pt_read  on project_teams    for select using (can_see_project(project_id));
create policy pt_write on project_teams    for all using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy pd_read  on project_defaults for select using (can_see_project(project_id));
create policy pd_write on project_defaults for all using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy pf_read  on project_fields   for select using (can_see_project(project_id));
create policy pf_write on project_fields   for all using (can_manage_project(project_id)) with check (can_manage_project(project_id));

-- notebook: project members read and write (guests read only)
create policy notes_read  on notes for select using (can_see_project(project_id));
create policy notes_write on notes for all
  using (can_see_project(project_id) and can_edit(workspace_id))
  with check (can_see_project(project_id) and can_edit(workspace_id));

-- tasks: visibility rule; everyone but guests adds and edits what they can see;
-- a new task must sit in a project they can see, or in no project
create policy tasks_read   on tasks for select using (can_see_task(id));
create policy tasks_insert on tasks for insert with check (
  can_edit(workspace_id) and (project_id is null or can_see_project(project_id))
  and created_by_member = my_member_id(workspace_id));
create policy tasks_update on tasks for update using (can_edit(workspace_id) and can_see_task(id));
create policy tasks_delete on tasks for delete using (
  sees_all(workspace_id) or created_by_member = my_member_id(workspace_id) or assignee_member_id = my_member_id(workspace_id));

create policy tc_read  on task_collaborators for select using (can_see_task(task_id));
create policy tc_write on task_collaborators for all
  using (can_edit(ws_of_task(task_id)) and can_see_task(task_id)) with check (can_edit(ws_of_task(task_id)) and can_see_task(task_id));
create policy tv_read  on task_values for select using (can_see_task(task_id));
create policy tv_write on task_values for all
  using (can_edit(ws_of_task(task_id)) and can_see_task(task_id)) with check (can_edit(ws_of_task(task_id)) and can_see_task(task_id));
create policy st_read  on subtasks for select using (can_see_task(task_id));
create policy st_write on subtasks for all
  using (can_edit(ws_of_task(task_id)) and can_see_task(task_id)) with check (can_edit(ws_of_task(task_id)) and can_see_task(task_id));

-- personal settings: only your own
create policy ms_self on member_settings for all
  using (exists (select 1 from workspace_members m where m.id = member_id and m.user_id = auth.uid()))
  with check (exists (select 1 from workspace_members m where m.id = member_id and m.user_id = auth.uid()));

-- =====================================================================
-- Login bootstrap
-- Called by the app right after every login:
--  1. creates the profile if missing,
--  2. accepts any open invitations sent to this email,
--  3. creates a personal workspace (with the person as Admin) if they
--     belong to none yet.
-- Returns the workspaces the person belongs to.
-- =====================================================================
create or replace function on_login(p_full_name text default null)
returns table (workspace_id uuid, workspace_name text, member_id uuid, access access_level)
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email citext;
  v_name  text;
  v_ws    uuid;
  v_mem   uuid;
  v_prio  uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select email into v_email from auth.users where id = v_uid;
  v_name := coalesce(nullif(trim(p_full_name), ''), split_part(v_email::text, '@', 1));

  insert into profiles (id, full_name) values (v_uid, v_name)
  on conflict (id) do nothing;

  update workspace_members
     set user_id = v_uid, status = 'active'
   where email = v_email and user_id is null;

  if not exists (select 1 from workspace_members where user_id = v_uid) then
    insert into workspaces (name, created_by) values (v_name || '’s workspace', v_uid) returning id into v_ws;
    insert into workspace_members (workspace_id, user_id, email, display_name, access, status)
      values (v_ws, v_uid, v_email, v_name, 'admin', 'active') returning id into v_mem;
    -- every workspace starts with the built-in Priority dimension
    insert into fields (workspace_id, name, type, is_dimension, builtin, position)
      values (v_ws, 'Priority', 'select', true, true, 0) returning id into v_prio;
    insert into field_options (field_id, workspace_id, label, color, position) values
      (v_prio, v_ws, 'High',   '#D0453A', 0),
      (v_prio, v_ws, 'Medium', '#8E5CC2', 1),
      (v_prio, v_ws, 'Low',    '#4A7FC1', 2);
  end if;

  return query
    select w.id, w.name, m.id, m.access
      from workspace_members m join workspaces w on w.id = m.workspace_id
     where m.user_id = v_uid and m.status = 'active'
     order by w.created_at;
end $$;

revoke all on function on_login(text) from public;
grant execute on function on_login(text) to authenticated;
