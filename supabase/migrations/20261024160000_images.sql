-- Images for project symbols and team badges.
-- Stored in the "images" bucket as <workspace id>/projects/<project id>/<file>
-- or <workspace id>/teams/<team id>/<file>. The app converts every picture to
-- a small WebP first. Like profile pictures, the bucket is public: anyone with
-- the exact link can see an image, and the links contain random ids.
-- Who may upload: for a project, whoever may edit it (admins, managers and the
-- project owner); for a team, admins and the team lead (the same people who
-- may edit the project or team itself).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 1048576, array['image/webp'])
on conflict (id) do nothing;

create or replace function image_folder_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := storage.foldername(p_name);
  v_ws uuid;
  v_id uuid;
begin
  if coalesce(array_length(parts, 1), 0) <> 3 then return false; end if;
  begin
    v_ws := parts[1]::uuid;
    v_id := parts[3]::uuid;
  exception when others then return false;
  end;
  if parts[2] = 'projects' then
    return exists (select 1 from projects where id = v_id and workspace_id = v_ws) and can_manage_project(v_id);
  elsif parts[2] = 'teams' then
    return exists (select 1 from teams t where t.id = v_id and t.workspace_id = v_ws
                   and (my_access(v_ws) = 'admin' or t.lead_member_id = my_member_id(v_ws)));
  end if;
  return false;
end $$;

revoke all on function image_folder_ok(text) from public;
grant execute on function image_folder_ok(text) to authenticated;

drop policy if exists images_insert on storage.objects;
drop policy if exists images_update on storage.objects;
drop policy if exists images_delete on storage.objects;
create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and image_folder_ok(name));
create policy images_update on storage.objects for update to authenticated
  using (bucket_id = 'images' and image_folder_ok(name));
create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and image_folder_ok(name));
