-- =====================================================================
-- Email people when an admin invites them from the Team page.
-- Same mechanism as the approval email: Resend API through pg_net, with the
-- key in Supabase Vault under resend_api_key. If the key or pg_net is missing,
-- the invitation is still saved and invite_emailed_at stays empty.
-- (The sign-up gate already lets an invited address create an account.)
-- =====================================================================

alter table workspace_members add column if not exists invite_emailed_at timestamptz;

create or replace function send_invitation_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key     text;
  v_ws      text;
  v_who     text;
  v_level   text;
  v_name    text;
  v_html    text;
begin
  if new.status = 'invited' and new.user_id is null then
    begin
      execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'$q$ into v_key;
      if v_key is not null then
        select name into v_ws from workspaces where id = new.workspace_id;
        select display_name into v_who from workspace_members
         where workspace_id = new.workspace_id and (id = new.invited_by or user_id = auth.uid())
         order by (id = new.invited_by) desc limit 1;
        v_level := case new.access::text when 'admin' then 'an admin' when 'manager' then 'a manager' when 'guest' then 'a guest (read-only)' else 'a member' end;
        v_name  := replace(replace(replace(coalesce(nullif(trim(new.display_name), ''), 'there'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
        v_who   := replace(replace(replace(coalesce(v_who, 'A colleague'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
        v_ws    := replace(replace(replace(coalesce(v_ws, 'a workspace'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
        v_html  := '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1c1f">'
          || '<h2 style="margin:0 0 12px">Hello ' || v_name || ', you are invited to Goose</h2>'
          || '<p style="line-height:1.55"><b>' || v_who || '</b> invited you to the workspace <b>' || v_ws || '</b> as ' || v_level || '.</p>'
          || '<p style="line-height:1.55">Create your account with this email address (' || replace(replace(new.email::text, '&', '&amp;'), '<', '&lt;') || ') and the workspace will be waiting for you.</p>'
          || '<p style="margin:24px 0"><a href="https://flightofthegoose.com/app/" style="background:#f28c28;color:#1b1c1f;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">Open Goose</a></p>'
          || '<p style="color:#6b6d73;font-size:13px">Choose "Create an account", pick a password, and confirm the email we send you. Already have a Goose account with this address? Just sign in.</p></div>';
        perform net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', 'Goose <noreply@flightofthegoose.com>',
            'to', jsonb_build_array(new.email::text),
            'subject', 'You are invited to join ' || coalesce((select name from workspaces where id = new.workspace_id), 'a workspace') || ' on Goose',
            'html', v_html,
            'text', 'You are invited to Goose. Create your account with ' || new.email::text || ' at https://flightofthegoose.com/app/'));
        new.invite_emailed_at := now();
      end if;
    exception when others then
      raise warning 'invitation email skipped: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists invitation_email on workspace_members;
create trigger invitation_email before insert on workspace_members
  for each row execute function send_invitation_email();
