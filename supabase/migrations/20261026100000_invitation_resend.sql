-- =====================================================================
-- 1. The approval and invitation emails now open the "Create account" form
--    with the person's email address already filled in
--    (https://flightofthegoose.com/app/?join=1&email=...).
-- 2. Admins can send an invitation again from the Team page (resend_invitation).
-- =====================================================================

create or replace function join_link(p_email text) returns text language sql immutable as $$
  select 'https://flightofthegoose.com/app/?join=1&email=' ||
    replace(replace(replace(replace(replace(replace(p_email, '%', '%25'), '+', '%2B'), '@', '%40'), '&', '%26'), '#', '%23'), '?', '%3F')
$$;

-- ---------- approval email (same as before, new link and button text) ----------
create or replace function send_approval_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key  text;
  v_name text := replace(replace(replace(coalesce(nullif(trim(new.name), ''), 'there'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_link text := join_link(new.email::text);
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.decided_at := now();
    begin
      execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'$q$ into v_key;
      if v_key is not null then
        perform net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', 'Goose <noreply@flightofthegoose.com>',
            'to', jsonb_build_array(new.email::text),
            'subject', 'Your place in Goose is ready',
            'html', '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1c1f">'
              || '<h2 style="margin:0 0 12px">Welcome to Goose, ' || v_name || '</h2>'
              || '<p style="line-height:1.55">Your request was approved. You can now create your account with this email address (' || replace(replace(new.email::text, '&', '&amp;'), '<', '&lt;') || ').</p>'
              || '<p style="margin:24px 0"><a href="' || v_link || '" style="background:#f28c28;color:#1b1c1f;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">Create your account</a></p>'
              || '<p style="color:#6b6d73;font-size:13px">Pick a password and confirm the email we send you. Already have a Goose account with this address? Just sign in at https://flightofthegoose.com/app/</p></div>',
            'text', 'Your request to join Goose was approved. Create your account with ' || new.email::text || ' here: ' || v_link
          )
        );
        new.emailed_at := now();
      end if;
    exception when others then
      raise warning 'approval email skipped: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

-- ---------- invitation email: one function used when inviting and when resending ----------
create or replace function send_invitation_mail(m workspace_members, p_inviter_member uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_key   text;
  v_ws    text;
  v_who   text;
  v_level text;
  v_name  text;
  v_link  text := join_link(m.email::text);
  v_html  text;
begin
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'$q$ into v_key;
  if v_key is null then return false; end if;
  select name into v_ws from workspaces where id = m.workspace_id;
  select display_name into v_who from workspace_members
   where workspace_id = m.workspace_id and (id = coalesce(p_inviter_member, m.invited_by) or user_id = auth.uid())
   order by (id = coalesce(p_inviter_member, m.invited_by)) desc limit 1;
  v_level := case m.access::text when 'admin' then 'an admin' when 'manager' then 'a manager' when 'guest' then 'a guest (read-only)' else 'a member' end;
  v_name  := replace(replace(replace(coalesce(nullif(trim(m.display_name), ''), 'there'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_who   := replace(replace(replace(coalesce(v_who, 'A colleague'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_html  := '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1c1f">'
    || '<h2 style="margin:0 0 12px">Hello ' || v_name || ', you are invited to Goose</h2>'
    || '<p style="line-height:1.55"><b>' || v_who || '</b> invited you to the workspace <b>' || replace(replace(replace(coalesce(v_ws, 'a workspace'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b> as ' || v_level || '.</p>'
    || '<p style="line-height:1.55">Create your account with this email address (' || replace(replace(m.email::text, '&', '&amp;'), '<', '&lt;') || ') and the workspace will be waiting for you.</p>'
    || '<p style="margin:24px 0"><a href="' || v_link || '" style="background:#f28c28;color:#1b1c1f;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">Create your account</a></p>'
    || '<p style="color:#6b6d73;font-size:13px">Pick a password and confirm the email we send you. Already have a Goose account with this address? Just sign in at https://flightofthegoose.com/app/</p></div>';
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'Goose <noreply@flightofthegoose.com>',
      'to', jsonb_build_array(m.email::text),
      'subject', 'You are invited to join ' || coalesce(v_ws, 'a workspace') || ' on Goose',
      'html', v_html,
      'text', 'You are invited to Goose. Create your account with ' || m.email::text || ' here: ' || v_link));
  return true;
end $$;
revoke all on function send_invitation_mail(workspace_members, uuid) from public;

create or replace function send_invitation_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'invited' and new.user_id is null then
    begin
      if send_invitation_mail(new) then new.invite_emailed_at := now(); end if;
    exception when others then
      raise warning 'invitation email skipped: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

-- ---------- "Send again" on the Team page ----------
create or replace function resend_invitation(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m workspace_members;
  v_me uuid;
begin
  select * into m from workspace_members where id = p_member;
  if not found or my_access(m.workspace_id) is distinct from 'admin' then
    raise exception 'Only an admin can send invitations.';
  end if;
  if m.status <> 'invited' or m.user_id is not null then
    raise exception 'This person has already joined.';
  end if;
  if m.invite_emailed_at is not null and m.invite_emailed_at > now() - interval '2 minutes' then
    raise exception 'The invitation was sent a moment ago. Please wait a couple of minutes before sending it again.';
  end if;
  select id into v_me from workspace_members where workspace_id = m.workspace_id and user_id = auth.uid();
  if not send_invitation_mail(m, v_me) then
    raise exception 'Email sending is not set up yet.';
  end if;
  update workspace_members set invite_emailed_at = now() where id = p_member;
end $$;
revoke all on function resend_invitation(uuid) from public;
grant execute on function resend_invitation(uuid) to authenticated;
