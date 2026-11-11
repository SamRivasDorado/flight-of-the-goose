-- =====================================================================
-- Email notifications.
--
-- What people are told about (each can be switched off in Your profile → Emails):
--   * mentions with @ (comments, task descriptions, notebook entries)
--   * comments on your tasks, and replies where you commented (the same rules as the bell)
--   * tasks assigned to you by someone else
--   * offers of help on your tasks, and answers to your own offers
--   * your tasks due tomorrow (in the morning email)
-- Emails are OFF until a person switches them on (Your profile → Emails).
-- and when: "as it happens" (grouped: at most one email every few minutes) or
-- "once a day" (one email in the morning).
--
-- How it works: triggers put a line in email_outbox for each person concerned
-- (only people who can see the task or notebook, never the person who acted).
-- send_goose_emails() turns each person's waiting lines into ONE email and sends
-- them through Resend's batch API with pg_net, with the key from the Vault
-- (resend_api_key, the same one the approval and invitation emails use).
-- pg_cron runs it every 5 minutes, and at 06:00 UTC (07:00 in Madrid in winter)
-- with the morning extras (due tomorrow, daily digests).
--
-- Nothing here can stop a comment, task or offer from being saved: every
-- email step catches its own errors. Without pg_cron, pg_net or the key, lines
-- simply wait (and are tidied up after a week).
-- The last statement shows a one-line status in the SQL Editor.
-- =====================================================================

do $$ begin create extension if not exists pg_net;
exception when others then raise notice 'pg_net not available here: emails are not sent'; end $$;

-- ---------- what each person wants (one row per person, all workspaces) ----------
create table if not exists email_prefs (
  user_id       uuid primary key references auth.users on delete cascade,
  enabled       boolean not null default false,  -- off until the person switches emails on
  mentions      boolean not null default true,
  comments      boolean not null default true,
  assigned      boolean not null default true,
  help          boolean not null default true,
  due           boolean not null default true,
  timing        text not null default 'soon' check (timing in ('soon', 'daily')),
  test_sent_at  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table email_prefs enable row level security;
grant select, insert, update on email_prefs to authenticated;
drop policy if exists email_prefs_self on email_prefs;
create policy email_prefs_self on email_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- lines waiting to be emailed ----------
create table if not exists email_outbox (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references workspace_members on delete cascade,  -- who is told
  workspace_id     uuid not null references workspaces on delete cascade,
  kind             text not null check (kind in ('mention', 'comment', 'reply', 'assigned', 'help', 'answer', 'due')),
  actor_member_id  uuid references workspace_members on delete set null,         -- who did it
  task_id          uuid references tasks on delete cascade,
  note_id          uuid references notes on delete cascade,
  excerpt          text not null default '',
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  skipped          boolean not null default false
);
create index if not exists email_outbox_waiting_idx on email_outbox (member_id, created_at) where sent_at is null;
-- Only Goose's own functions use this table: no rules, so nobody reads it from the app.
alter table email_outbox enable row level security;

-- ---------- who can see what, for a given person (the same rules as can_see_task etc.) ----------
create or replace function member_sees_project(mid uuid, pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    join workspace_members m on m.id = mid and m.workspace_id = p.workspace_id and m.status = 'active'
    where p.id = pid and (
      m.access in ('admin', 'manager')
      or p.owner_member_id = mid
      or exists (select 1 from project_members pm where pm.project_id = p.id and pm.member_id = mid)
      or exists (select 1 from project_teams pt join team_members tm on tm.team_id = pt.team_id
                 where pt.project_id = p.id and tm.member_id = mid)))
$$;

create or replace function member_sees_task(mid uuid, tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t
    join workspace_members m on m.id = mid and m.workspace_id = t.workspace_id and m.status = 'active'
    left join goals g  on g.id = t.goal_id
    left join goals gp on gp.id = g.parent_id
    where t.id = tid and (
      m.access in ('admin', 'manager')
      or t.assignee_member_id = mid
      or t.created_by_member  = mid
      or exists (select 1 from task_collaborators c where c.task_id = t.id and c.member_id = mid)
      or (t.project_id is not null and member_sees_project(mid, t.project_id))
      or g.owner_member_id  = mid
      or gp.owner_member_id = mid))
$$;

create or replace function member_sees_note(mid uuid, nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notes n where n.id = nid and member_sees_project(mid, n.project_id))
$$;

-- ---------- putting a line in the outbox ----------
create or replace function queue_email(p_member uuid, p_kind text, p_actor uuid, p_task uuid, p_note uuid, p_excerpt text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ws uuid;
begin
  if p_member is null or p_member is not distinct from p_actor then return; end if;
  select workspace_id into v_ws from workspace_members where id = p_member and status = 'active' and user_id is not null;
  if v_ws is null then return; end if;
  if not exists (select 1 from email_prefs p join workspace_members m on m.user_id = p.user_id
                 where m.id = p_member and p.enabled) then return; end if;   -- emails are off for this person
  if p_task is not null and not member_sees_task(p_member, p_task) then return; end if;
  if p_note is not null and not member_sees_note(p_member, p_note) then return; end if;
  insert into email_outbox (member_id, workspace_id, kind, actor_member_id, task_id, note_id, excerpt)
  values (p_member, v_ws, p_kind, p_actor, p_task, p_note, left(coalesce(p_excerpt, ''), 400));
exception when others then
  raise warning 'email not queued: %', sqlerrm;
end $$;

-- comments: mentioned people, the task's assignee, and earlier people in the thread
-- (each person once, in that order of importance; as in the bell)
create or replace function email_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_told uuid[] := '{}';
  v_assignee uuid;
  r record;
begin
  begin
    for r in select distinct x as mid from unnest(new.mentions) x loop
      perform queue_email(r.mid, 'mention', new.author_member_id, new.task_id, new.note_id, new.body);
      v_told := v_told || r.mid;
    end loop;
    if new.task_id is not null then
      select assignee_member_id into v_assignee from tasks where id = new.task_id;
      if v_assignee is not null and not (v_assignee = any(v_told)) then
        perform queue_email(v_assignee, 'comment', new.author_member_id, new.task_id, null, new.body);
        v_told := v_told || v_assignee;
      end if;
    end if;
    for r in select distinct c.author_member_id as mid from comments c
             where c.id <> new.id and c.author_member_id is not null
               and ((new.task_id is not null and c.task_id = new.task_id) or (new.note_id is not null and c.note_id = new.note_id)) loop
      if not (r.mid = any(v_told)) then
        perform queue_email(r.mid, 'reply', new.author_member_id, new.task_id, new.note_id, new.body);
      end if;
    end loop;
  exception when others then raise warning 'comment email skipped: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists email_on_comment on comments;
create trigger email_on_comment after insert on comments for each row execute function email_on_comment();

-- @mentions in task descriptions and notebook entries
create or replace function email_on_mention() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform queue_email(new.member_id, 'mention', new.author_member_id, new.task_id, new.note_id, new.excerpt);
  return null;
end $$;
drop trigger if exists email_on_mention on mention_events;
create trigger email_on_mention after insert on mention_events for each row execute function email_on_mention();

-- offers of help, and the answers to them
create or replace function email_on_help() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'offered' then
    perform queue_email(new.helped_member_id, 'help', new.helper_member_id, new.task_id, null, new.message);
  elsif tg_op = 'UPDATE' and old.status = 'offered' and new.status in ('accepted', 'declined') then
    perform queue_email(new.helper_member_id, 'answer', new.helped_member_id, new.task_id, null, new.status);
  end if;
  return null;
end $$;
drop trigger if exists email_on_help on help_offers;
create trigger email_on_help after insert or update of status on help_offers for each row execute function email_on_help();

-- tasks given to someone by someone else (not the next copy of a repeating task:
-- that one is made by another trigger, so its depth is above 1)
create or replace function email_on_assign() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if new.assignee_member_id is not null and new.status <> 'done'
     and (tg_op = 'INSERT' or new.assignee_member_id is distinct from old.assignee_member_id) then
    perform queue_email(new.assignee_member_id, 'assigned', my_member_id(new.workspace_id), new.id, null, '');
  end if;
  return null;
exception when others then
  raise warning 'assignment email skipped: %', sqlerrm;
  return null;
end $$;
drop trigger if exists email_on_assign on tasks;
create trigger email_on_assign after insert or update of assignee_member_id on tasks for each row execute function email_on_assign();

-- ---------- the email itself ----------
create or replace function email_esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- items: [{kind, actor, title, where, excerpt, link, workspace}] -> {subject, html, text}
-- (the app's "See an example" draws the same thing: src/lib/emailPreview.ts)
create or replace function email_render(p_items jsonb, p_name text) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  it jsonb;
  n int := jsonb_array_length(p_items);
  n_due int := (select count(*) from jsonb_array_elements(p_items) x where x->>'kind' = 'due');
  several_ws boolean := (select count(distinct x->>'workspace') > 1 from jsonb_array_elements(p_items) x);
  v_ws text := null;
  v_html text := '';
  v_text text := '';
  v_line text;
  v_verb text;
  v_subject text;
  app constant text := 'https://flightofthegoose.com/app/';
begin
  for it in select x from jsonb_array_elements(p_items) x loop
    v_verb := case it->>'kind'
      when 'mention'  then case when it->>'where' = 'note' then 'mentioned you in the notebook:' else 'mentioned you on' end
      when 'comment'  then 'commented on your task'
      when 'reply'    then case when it->>'where' = 'note' then 'replied in the notebook:' else 'replied on' end
      when 'assigned' then 'gave you the task'
      when 'help'     then 'offered to help with'
      when 'answer'   then case when it->>'excerpt' = 'accepted' then 'accepted your offer to help with' else 'said no thanks to your offer to help with' end
      when 'due'      then 'Due tomorrow:'
      else 'updated' end;
    v_line := case when it->>'kind' = 'due' then v_verb else coalesce(nullif(it->>'actor', ''), 'Someone') || ' ' || v_verb end
      || ' ' || coalesce(nullif(it->>'title', ''), 'Untitled task');
    if several_ws and it->>'workspace' is distinct from v_ws then
      v_ws := it->>'workspace';
      v_html := v_html || '<tr><td style="padding:18px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b6d73">' || email_esc(v_ws) || '</td></tr>';
      v_text := v_text || E'\n' || upper(v_ws) || E'\n';
    end if;
    v_html := v_html || '<tr><td style="padding:12px 0;border-top:1px solid #ecebe6">'
      || '<div style="line-height:1.45">'
      || case when it->>'kind' = 'due' then '<span style="color:#b5561d;font-weight:bold">Due tomorrow:</span>'
              else '<b>' || email_esc(coalesce(nullif(it->>'actor', ''), 'Someone')) || '</b> ' || email_esc(v_verb) end
      || ' <a href="' || email_esc(coalesce(it->>'link', app)) || '" style="color:#1b1c1f;font-weight:bold">' || email_esc(coalesce(nullif(it->>'title', ''), 'Untitled task')) || '</a></div>'
      || case when coalesce(it->>'excerpt', '') <> '' and it->>'kind' not in ('answer', 'due', 'assigned')
              then '<div style="margin-top:6px;padding:8px 12px;background:#f6f5f0;border-left:3px solid #f28c28;border-radius:6px;color:#3a3b3f;font-size:14px;line-height:1.45">'
                   || email_esc(case when length(it->>'excerpt') > 280 then left(it->>'excerpt', 277) || '…' else it->>'excerpt' end) || '</div>'
              else '' end
      || case when coalesce(it->>'project', '') <> '' then '<div style="margin-top:4px;color:#8a8c91;font-size:12px">' || email_esc(it->>'project') || '</div>' else '' end
      || '</td></tr>';
    v_text := v_text || '- ' || v_line
      || case when coalesce(it->>'excerpt', '') <> '' and it->>'kind' not in ('answer', 'due', 'assigned') then E'\n  "' || left(it->>'excerpt', 280) || '"' else '' end
      || E'\n  ' || coalesce(it->>'link', app) || E'\n';
  end loop;

  v_subject := case
    when n = 1 then v_line
    when n_due = n then n || ' of your tasks are due tomorrow'
    else n || ' updates for you in Goose' end;

  return jsonb_build_object(
    'subject', v_subject,
    'html', '<div style="background:#f6f5f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1b1c1f">'
      || '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">'
      || '<div style="background:#1b1c1f;padding:14px 22px"><img src="' || app || 'goose-tile-96.png" width="32" height="32" alt="" style="vertical-align:middle;border-radius:8px">'
      || '<span style="color:#ffffff;font-weight:bold;font-size:17px;vertical-align:middle;margin-left:10px">Goose</span></div>'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
      || '<td height="4" style="height:4px;font-size:0;line-height:0;background:#F4CB5D" bgcolor="#F4CB5D">&nbsp;</td>'
      || '<td height="4" style="height:4px;font-size:0;line-height:0;background:#6B9160" bgcolor="#6B9160">&nbsp;</td>'
      || '<td height="4" style="height:4px;font-size:0;line-height:0;background:#5D7A4B" bgcolor="#5D7A4B">&nbsp;</td>'
      || '<td height="4" style="height:4px;font-size:0;line-height:0;background:#E5A957" bgcolor="#E5A957">&nbsp;</td></tr></table>'
      || '<div style="padding:20px 22px 8px"><p style="margin:0 0 6px;font-size:16px">Hello ' || email_esc(coalesce(nullif(p_name, ''), 'there')) || ',</p>'
      || '<p style="margin:0;color:#6b6d73;font-size:14px">' || case when n = 1 then 'Here is what happened in Goose.' else 'Here is what happened in Goose since we last wrote.' end || '</p>'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:15px">' || v_html || '</table></div>'
      || '<div style="padding:8px 22px 22px"><a href="' || app || '" style="display:inline-block;background:#f28c28;color:#1b1c1f;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">Open Goose</a></div>'
      || '<div style="padding:14px 22px;border-top:1px solid #ecebe6;color:#8a8c91;font-size:12px;line-height:1.5">You get these emails because you use Goose. '
      || 'Choose which ones, and how often, in <a href="' || app || '#/emails" style="color:#6b6d73">your email settings</a>.</div>'
      || '</div></div>',
    'text', 'Hello ' || coalesce(nullif(p_name, ''), 'there') || E',\n\n' || v_text
      || E'\nOpen Goose: ' || app || E'\nChoose which emails you get: ' || app || '#/emails' || E'\n');
end $$;

-- the next morning's tasks
create or replace function queue_due_tomorrow() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into email_outbox (member_id, workspace_id, kind, task_id)
  select t.assignee_member_id, t.workspace_id, 'due', t.id
  from tasks t join workspace_members m on m.id = t.assignee_member_id and m.status = 'active' and m.user_id is not null
  join email_prefs p on p.user_id = m.user_id and p.enabled and p.due
  where t.due_date = current_date + 1 and t.status <> 'done'
    and not exists (select 1 from email_outbox o where o.kind = 'due' and o.task_id = t.id and o.member_id = t.assignee_member_id
                    and o.created_at > now() - interval '20 hours');
end $$;

-- Sends what is waiting. p_morning: also the daily digests and "due tomorrow".
-- Returns how many emails were handed to Resend.
create or replace function send_goose_emails(p_morning boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_key   text;
  v_batch jsonb := '[]';
  v_sent  int := 0;
  v_ids   uuid[] := '{}';
  u       record;
  v_mail  jsonb;
begin
  begin
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'$q$ into v_key;
  exception when others then v_key := null; end;
  if v_key is null then return 0; end if;
  if p_morning then
    perform queue_due_tomorrow();
    delete from email_outbox where created_at < now() - interval '30 days';
    delete from email_outbox where sent_at is null and created_at < now() - interval '7 days';
  end if;

  -- set aside what the person switched off or what no longer applies
  update email_outbox o set sent_at = now(), skipped = true
  from workspace_members m left join email_prefs p on p.user_id = m.user_id
  where o.sent_at is null and m.id = o.member_id and (
    m.status <> 'active' or m.user_id is null
    or not coalesce(p.enabled, false)
    or (o.kind = 'mention' and not coalesce(p.mentions, true))
    or (o.kind in ('comment', 'reply') and not coalesce(p.comments, true))
    or (o.kind = 'assigned' and not coalesce(p.assigned, true))
    or (o.kind in ('help', 'answer') and not coalesce(p.help, true))
    or (o.kind = 'due' and not coalesce(p.due, true))
    or (o.task_id is not null and not member_sees_task(o.member_id, o.task_id))
    or (o.note_id is not null and not member_sees_note(o.member_id, o.note_id))
    or (o.kind in ('assigned', 'due') and not exists (select 1 from tasks t where t.id = o.task_id and t.assignee_member_id = o.member_id and t.status <> 'done'))
    or (o.kind = 'due' and not exists (select 1 from tasks t where t.id = o.task_id and t.due_date = current_date + 1)));

  -- one email per person
  for u in
    select m.user_id, au.email::text as email,
           coalesce(nullif(pr.full_name, ''), min(m.display_name)) as name,
           array_agg(o.id order by o.created_at) as ids,
           jsonb_agg(jsonb_build_object(
             'kind', o.kind,
             'actor', a.display_name,
             'title', case when o.task_id is not null then coalesce(nullif(t.title, ''), 'Untitled task')
                           else coalesce((select l from unnest(string_to_array(n.body, E'\n')) l where btrim(l) <> '' limit 1), 'Notebook entry') end,
             'where', case when o.note_id is not null then 'note' else 'task' end,
             'project', coalesce(tp.name, np.name, ''),
             'excerpt', o.excerpt,
             'workspace', w.name,
             'link', 'https://flightofthegoose.com/app/#/go/' || o.workspace_id
                     || case when o.task_id is not null then '/task/' || o.task_id else '/note/' || n.project_id || '/' || o.note_id end)
             order by w.name, (o.kind = 'due') desc, o.created_at) as items
    from email_outbox o
    join workspace_members m on m.id = o.member_id
    join auth.users au on au.id = m.user_id
    join workspaces w on w.id = o.workspace_id
    left join profiles pr on pr.id = m.user_id
    left join email_prefs p on p.user_id = m.user_id
    left join workspace_members a on a.id = o.actor_member_id
    left join tasks t on t.id = o.task_id
    left join projects tp on tp.id = t.project_id
    left join notes n on n.id = o.note_id
    left join projects np on np.id = n.project_id
    where o.sent_at is null
    group by m.user_id, au.email, pr.full_name, p.timing
    having p_morning
        or (coalesce(p.timing, 'soon') = 'soon'
            and (max(o.created_at) < now() - interval '1 minute' or min(o.created_at) < now() - interval '10 minutes'))
  loop
    v_mail := email_render(u.items, u.name);
    v_batch := v_batch || jsonb_build_array(jsonb_build_object(
      'from', 'Goose <noreply@flightofthegoose.com>', 'to', jsonb_build_array(u.email),
      'subject', v_mail->>'subject', 'html', v_mail->>'html', 'text', v_mail->>'text'));
    v_ids := v_ids || u.ids;
    v_sent := v_sent + 1;
    if jsonb_array_length(v_batch) = 100 then   -- Resend takes up to 100 emails per call
      perform net.http_post(url := 'https://api.resend.com/emails/batch',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'), body := v_batch);
      v_batch := '[]';
    end if;
  end loop;
  if jsonb_array_length(v_batch) > 0 then
    perform net.http_post(url := 'https://api.resend.com/emails/batch',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'), body := v_batch);
  end if;
  update email_outbox set sent_at = now() where id = any(v_ids);
  return v_sent;
end $$;

-- "Send me a test email" in Your profile → Emails (at most once a minute)
create or replace function send_test_email() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_key   text;
  v_email text;
  v_name  text;
  v_last  timestamptz;
  v_mail  jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select email::text into v_email from auth.users where id = auth.uid();
  select full_name into v_name from profiles where id = auth.uid();
  select test_sent_at into v_last from email_prefs where user_id = auth.uid();
  if v_last > now() - interval '1 minute' then return 'wait'; end if;
  begin
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'$q$ into v_key;
  exception when others then v_key := null; end;
  if v_key is null then return 'not_ready'; end if;
  v_mail := email_render(jsonb_build_array(
    jsonb_build_object('kind', 'mention', 'actor', 'Goose', 'title', 'This is a test email', 'excerpt',
      'If you can read this, Goose can reach you. Real emails list mentions, comments, tasks given to you, offers of help and tasks due tomorrow.',
      'link', 'https://flightofthegoose.com/app/#/emails', 'workspace', '')), v_name);
  perform net.http_post(url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('from', 'Goose <noreply@flightofthegoose.com>', 'to', jsonb_build_array(v_email),
      'subject', 'Goose test email', 'html', v_mail->>'html', 'text', v_mail->>'text'));
  insert into email_prefs (user_id, test_sent_at) values (auth.uid(), now())
    on conflict (user_id) do update set test_sent_at = now();
  return 'sent';
end $$;

-- Only the app's test button may be called from outside; the rest is Goose's own machinery.
revoke execute on function member_sees_project(uuid, uuid), member_sees_task(uuid, uuid), member_sees_note(uuid, uuid),
  queue_email(uuid, text, uuid, uuid, uuid, text), queue_due_tomorrow(), send_goose_emails(boolean),
  email_render(jsonb, text) from public, anon, authenticated;
revoke execute on function send_test_email() from public, anon;
grant execute on function send_test_email() to authenticated;

-- ---------- the schedule ----------
do $$ begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('goose-emails', '*/5 * * * *', 'select public.send_goose_emails(false)');
  perform cron.schedule('goose-emails-morning', '0 6 * * *', 'select public.send_goose_emails(true)');
exception when others then
  raise notice 'pg_cron not available here, so emails are not sent on a schedule: %', sqlerrm;
end $$;

-- One line for the SQL Editor: is everything in place?
create or replace function email_setup_status() returns text
language plpgsql security definer set search_path = public as $$
declare v_key boolean := false; v_cron boolean := false; v_net boolean;
begin
  v_net := exists (select 1 from pg_extension where extname = 'pg_net');
  begin execute $q$select exists (select 1 from vault.decrypted_secrets where name = 'resend_api_key')$q$ into v_key;
  exception when others then v_key := false; end;
  begin execute $q$select count(*) = 2 from cron.job where jobname in ('goose-emails', 'goose-emails-morning')$q$ into v_cron;
  exception when others then v_cron := false; end;
  return case when v_key and v_cron and v_net then 'Email notifications are ready.'
    else 'Saved, but emails cannot go out yet: missing ' || concat_ws(', ',
      case when not v_net then 'pg_net' end, case when not v_key then 'the Resend key' end, case when not v_cron then 'the schedule (pg_cron)' end) || '.' end;
end $$;
revoke execute on function email_setup_status() from public, anon, authenticated;
select email_setup_status() as "Goose emails";
