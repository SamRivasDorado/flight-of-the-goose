-- @mentions written in task descriptions and notebook entries (comments keep theirs in
-- comments.mentions). One row per person mentioned, so it reaches their bell.
-- Only the person mentioned (and the author) can read it, and only while they can see the
-- task or the notebook. Needs 20261026200000_comments.sql first (can_see_note, ws_of_note).
create table if not exists mention_events (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces on delete cascade,
  member_id         uuid not null references workspace_members on delete cascade,   -- who was mentioned
  author_member_id  uuid references workspace_members on delete set null,
  task_id           uuid references tasks on delete cascade,
  note_id           uuid references notes on delete cascade,
  excerpt           text not null default '' check (length(excerpt) <= 500),
  created_at        timestamptz not null default now(),
  check ((task_id is null) <> (note_id is null))
);
create index if not exists mention_events_member_idx on mention_events (member_id, created_at);

alter table mention_events enable row level security;
grant select, insert, delete on mention_events to authenticated;

drop policy if exists mentions_read on mention_events;
create policy mentions_read on mention_events for select using (
  (member_id = my_member_id(workspace_id) or author_member_id = my_member_id(workspace_id))
  and case when task_id is not null then can_see_task(task_id) else can_see_note(note_id) end);

drop policy if exists mentions_insert on mention_events;
create policy mentions_insert on mention_events for insert with check (
  can_edit(workspace_id)
  and author_member_id = my_member_id(workspace_id)
  and exists (select 1 from workspace_members m where m.id = member_id and m.workspace_id = mention_events.workspace_id)
  and case when task_id is not null then ws_of_task(task_id) = workspace_id and can_see_task(task_id)
           else ws_of_note(note_id) = workspace_id and can_see_note(note_id) end);

drop policy if exists mentions_delete on mention_events;
create policy mentions_delete on mention_events for delete
  using (member_id = my_member_id(workspace_id) or author_member_id = my_member_id(workspace_id));
