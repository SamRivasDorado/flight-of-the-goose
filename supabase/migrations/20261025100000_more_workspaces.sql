-- Several workspaces per person, each with its own name and picture.
-- The role (access level) was already per workspace (workspace_members.access).

-- Anyone signed in can create an extra workspace and becomes its admin.
-- Their name, title, colour and picture start from their profile.
create or replace function create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_ws   uuid;
  v_prio uuid;
  p      profiles%rowtype;
  v_email citext;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'Give the workspace a name.'; end if;
  if length(v_name) > 80 then raise exception 'That name is too long.'; end if;
  -- a simple brake against runaway creation
  if (select count(*) from workspaces where created_by = v_uid) >= 20 then
    raise exception 'You already have 20 workspaces.';
  end if;
  select * into p from profiles where id = v_uid;
  select email into v_email from auth.users where id = v_uid;

  insert into workspaces (name, created_by) values (v_name, v_uid) returning id into v_ws;
  insert into workspace_members (workspace_id, user_id, email, display_name, title, access, status, color, avatar_url)
  values (v_ws, v_uid, v_email, coalesce(nullif(p.full_name, ''), split_part(v_email::text, '@', 1)), coalesce(p.title, ''),
          'admin', 'active', coalesce(p.color, '#5B83B5'), p.avatar_url);
  -- every workspace starts with the built-in Priority dimension
  insert into fields (workspace_id, name, type, is_dimension, builtin, position)
    values (v_ws, 'Priority', 'select', true, true, 0) returning id into v_prio;
  insert into field_options (field_id, workspace_id, label, color, position) values
    (v_prio, v_ws, 'High',   '#D0453A', 0),
    (v_prio, v_ws, 'Medium', '#8E5CC2', 1),
    (v_prio, v_ws, 'Low',    '#4A7FC1', 2);
  return v_ws;
end $$;

revoke all on function create_workspace(text) from public;
grant execute on function create_workspace(text) to authenticated;

-- Changes your name, title, colour and picture in ONE workspace only
-- (save_my_profile still changes them everywhere). Your role is not touched:
-- that stays with the workspace's admins.
create or replace function save_my_membership(p_ws uuid, p_name text, p_title text, p_color text, p_avatar_url text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(trim(p_name), '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'Add your name.'; end if;
  if p_avatar_url is not null and p_avatar_url !~ '^https?://' then raise exception 'Invalid picture address.'; end if;
  update workspace_members
     set display_name = v_name, title = coalesce(trim(p_title), ''), avatar_url = p_avatar_url, color = coalesce(p_color, color)
   where workspace_id = p_ws and user_id = auth.uid();
  if not found then raise exception 'You are not in that workspace.'; end if;
end $$;

revoke all on function save_my_membership(uuid, text, text, text, text) from public;
grant execute on function save_my_membership(uuid, text, text, text, text) to authenticated;
