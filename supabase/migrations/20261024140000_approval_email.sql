-- =====================================================================
-- Approval email: when a request in access_requests is set to 'approved',
-- Goose emails the person (through Resend) that their place is ready.
--
-- Needs, once, in Supabase:
--   * the pg_net extension (Database > Extensions; it is on by default), and
--   * the Resend API key stored in the Vault under the name resend_api_key
--     (see the SQL in the hand-over note; the key never appears in the code).
-- If either is missing, approving still works; the email is just skipped
-- (emailed_at stays empty).
-- =====================================================================

do $$ begin create extension if not exists pg_net;
exception when others then raise notice 'pg_net not available here: approval emails are skipped'; end $$;

alter table access_requests add column if not exists emailed_at timestamptz;

create or replace function send_approval_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key  text;
  v_name text := replace(replace(replace(coalesce(nullif(trim(new.name), ''), 'there'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
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
              || '<p style="line-height:1.55">Your request was approved. You can now create your account with this email address (' || new.email::text || ').</p>'
              || '<p style="margin:24px 0"><a href="https://flightofthegoose.com/app/" style="background:#f28c28;color:#1b1c1f;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Open Goose</a></p>'
              || '<p style="color:#6b6d73;font-size:13px">Choose "Create an account", pick a password, and confirm the email we send you.</p></div>',
            'text', 'Your request to join Goose was approved. Create your account with ' || new.email::text || ' at https://flightofthegoose.com/app/'
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

drop trigger if exists approval_email on access_requests;
create trigger approval_email before insert or update of status on access_requests
  for each row execute function send_approval_email();
