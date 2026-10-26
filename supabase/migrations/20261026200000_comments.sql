-- Comments on tasks and on notebook entries, with @mentions.
-- Whoever can see the task (or the notebook's project) reads its comments; everyone but
-- guests can add them; you edit your own; you or an admin can delete them.
create table if not exists comments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces on delete cascade,
  task_id           uuid references tasks on delete cascade,
  note_id           uuid references notes on delete cascade,
  author_member_id  uuid references workspace_members on delete set null,
  body              text not null check (length(btrim(body)) between 1 and 5000),
  mentions          uuid[] not null default '{}',     -- workspace_members mentioned with @
  created_at        timestamptz not null default now(),
  edited_at         timestamptz,
  check ((task_id is null) <> (note_id is null))      -- on a task, or on a notebook entry
);
create index if not exists comments_task_idx on comments (task_id);
create index if not exists comments_note_idx on comments (note_id);
create index if not exists comments_ws_idx on comments (workspace_id, created_at);

create or replace function can_see_note(nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notes n where n.id = nid and can_see_project(n.project_id))
$$;
create or replace function ws_of_note(nid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select workspace_id from notes where id = nid $$;

alter table comments enable row level security;
grant select, insert, update, delete on comments to authenticated;

drop policy if exists comments_read on comments;
create policy comments_read on comments for select using (
  case when task_id is not null then can_see_task(task_id) else can_see_note(note_id) end);

drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert with check (
  can_edit(workspace_id)
  and author_member_id = my_member_id(workspace_id)
  and case when task_id is not null then ws_of_task(task_id) = workspace_id and can_see_task(task_id)
           else ws_of_note(note_id) = workspace_id and can_see_note(note_id) end);

drop policy if exists comments_update on comments;
create policy comments_update on comments for update
  using (author_member_id = my_member_id(workspace_id))
  with check (author_member_id = my_member_id(workspace_id));

drop policy if exists comments_delete on comments;
create policy comments_delete on comments for delete
  using (author_member_id = my_member_id(workspace_id) or my_access(workspace_id) = 'admin');
