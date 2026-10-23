-- Profiles: name, job title, colour and picture chosen by each person,
-- asked once on first sign-in ("Welcome to Goose") and editable later.

alter table profiles add column if not exists title      text    not null default '';
alter table profiles add column if not exists color      text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists setup_done boolean not null default false;

alter table workspace_members add column if not exists avatar_url text;

-- Saves the signed-in person's profile and copies name, title, colour and
-- picture to every workspace they belong to (people cannot edit their own
-- membership rows directly; only admins can).
create or replace function save_my_profile(p_name text, p_title text, p_color text, p_avatar_url text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'Add your name.'; end if;
  if p_avatar_url is not null and p_avatar_url !~ '^https?://' then raise exception 'Invalid picture address.'; end if;
  select full_name into v_old from profiles where id = v_uid;

  insert into profiles (id, full_name, title, color, avatar_url, setup_done)
  values (v_uid, v_name, coalesce(trim(p_title), ''), p_color, p_avatar_url, true)
  on conflict (id) do update set full_name = excluded.full_name, title = excluded.title,
    color = excluded.color, avatar_url = excluded.avatar_url, setup_done = true;

  update workspace_members
     set display_name = v_name, title = coalesce(trim(p_title), ''), avatar_url = p_avatar_url,
         color = coalesce(p_color, color)
   where user_id = v_uid;

  -- the personal workspace was named after the old name ("sam’s workspace")
  if v_old is not null and v_old <> v_name then
    update workspaces set name = v_name || '’s workspace'
     where created_by = v_uid and name = v_old || '’s workspace';
  end if;
end $$;

revoke all on function save_my_profile(text, text, text, text) from public;
grant execute on function save_my_profile(text, text, text, text) to authenticated;

-- Picture store: a public "avatars" bucket (anyone with the link can see a
-- picture, as with any profile photo); each person can only write in their
-- own folder (<their user id>/...). Small images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
