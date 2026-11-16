-- Files attached to tasks.
-- Kept in the PRIVATE "task-files" bucket as <workspace id>/<task id>/<file id>/<file name>,
-- with one row per file in task_files. Unlike pictures, these files have no public link:
-- the app asks for a short-lived signed link each time someone opens one.
-- Who may do what (the same people for the row and for the stored file):
--   see and open a file:  whoever can see the task
--   attach a file:        whoever can see the task, except guests
--   remove a file:        whoever attached it, the task's creator or assignee, admins and managers
-- Up to 25 MB per file, any type.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-files', 'task-files', false, 26214400, null)
on conflict (id) do nothing;

create table if not exists task_files (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  task_id       uuid not null references tasks on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 255),
  size          bigint not null default 0 check (size >= 0),
  mime          text not null default '',
  path          text not null unique,
  uploaded_by   uuid references workspace_members on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists task_files_task_idx on task_files (task_id, created_at);

/** May I remove this file? Its uploader, the task's creator or assignee, admins and managers. */
create or replace function can_remove_task_file(p_task uuid, p_uploader uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t where t.id = p_task and can_edit(t.workspace_id) and can_see_task(t.id) and (
    sees_all(t.workspace_id)
    or p_uploader = my_member_id(t.workspace_id)
    or t.created_by_member  = my_member_id(t.workspace_id)
    or t.assignee_member_id = my_member_id(t.workspace_id)))
$$;

alter table task_files enable row level security;
grant select, insert, delete on task_files to authenticated;

drop policy if exists task_files_read on task_files;
create policy task_files_read on task_files for select using (can_see_task(task_id));

drop policy if exists task_files_insert on task_files;
create policy task_files_insert on task_files for insert with check (
  can_edit(workspace_id)
  and ws_of_task(task_id) = workspace_id
  and can_see_task(task_id)
  and uploaded_by = my_member_id(workspace_id)
  and path like workspace_id::text || '/' || task_id::text || '/%');

drop policy if exists task_files_delete on task_files;
create policy task_files_delete on task_files for delete using (can_remove_task_file(task_id, uploaded_by));

-- The stored files follow the same rules, read from their path.
-- p_what: 'read', 'add' or 'remove'. A stored file whose row is already gone may be tidied away
-- by anyone who may edit the task, or, once the task itself is deleted, by the workspace's editors.
create or replace function task_file_ok(p_name text, p_what text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := storage.foldername(p_name);
  v_ws uuid;
  v_task uuid;
  v_row task_files;
begin
  if coalesce(array_length(parts, 1), 0) <> 3 then return false; end if;
  begin
    v_ws := parts[1]::uuid;
    v_task := parts[2]::uuid;
    perform parts[3]::uuid;
  exception when others then return false;
  end;
  if not exists (select 1 from tasks where id = v_task and workspace_id = v_ws) then
    -- the task was deleted: its leftover files (no record any more) may be tidied away by the workspace's
    -- editors (to delete a stored file they must also be able to see it)
    return p_what in ('read', 'remove') and can_edit(v_ws) and not exists (select 1 from task_files where path = p_name);
  end if;
  if not can_see_task(v_task) then return false; end if;
  if p_what = 'read' then return true; end if;
  if not can_edit(v_ws) then return false; end if;
  if p_what = 'add' then return true; end if;
  select * into v_row from task_files where path = p_name;
  if not found then return true; end if;
  return can_remove_task_file(v_task, v_row.uploaded_by);
end $$;

revoke all on function task_file_ok(text, text) from public;
grant execute on function task_file_ok(text, text) to authenticated;
revoke all on function can_remove_task_file(uuid, uuid) from public;
grant execute on function can_remove_task_file(uuid, uuid) to authenticated;

drop policy if exists task_files_obj_read on storage.objects;
drop policy if exists task_files_obj_insert on storage.objects;
drop policy if exists task_files_obj_delete on storage.objects;
create policy task_files_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and task_file_ok(name, 'read'));
create policy task_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and task_file_ok(name, 'add'));
create policy task_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and task_file_ok(name, 'remove'));
