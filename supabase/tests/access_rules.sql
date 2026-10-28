-- Access-rule tests: run after the migration (see README, "Testing the
-- security rules"). Each check raises an exception when a rule is broken.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Sign-up is invite-only: approve these addresses first (the gate itself is tested at the end).
insert into access_requests (email, status) values
  ('sam@example.com','approved'),('omar@example.com','approved'),('julia@example.com','approved'),
  ('karim@example.com','approved'),('stranger@example.com','approved');
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a','sam@example.com'),
  ('00000000-0000-0000-0000-00000000000b','omar@example.com'),
  ('00000000-0000-0000-0000-00000000000c','julia@example.com'),
  ('00000000-0000-0000-0000-00000000000d','karim@example.com'),
  ('00000000-0000-0000-0000-00000000000e','stranger@example.com');

create or replace function pg_temp.login(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', what; end if; raise notice 'ok  %', what; end $$;

set role authenticated;

-- Sam signs up: gets a personal workspace as Admin, with Priority
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table ws as select * from on_login('Sam Rivas');
select pg_temp.check((select count(*) from ws) = 1 and (select access from ws) = 'admin', 'sign-up creates a personal workspace with the person as admin');
select pg_temp.check((select count(*) from field_options) = 3, 'new workspace has High, Medium, Low priorities');

-- Sam invites three people
insert into workspace_members (workspace_id, email, display_name, access)
select workspace_id, e, n, a::access_level from ws, (values ('omar@example.com','Omar','member'),('julia@example.com','Julia','guest'),('karim@example.com','Karim','manager')) v(e,n,a);
create temp table ids as select (select member_id from ws) sam, (select workspace_id from ws) w;
-- projects and tasks
insert into projects (workspace_id, name, color, owner_member_id) select w, 'P1 with Omar', '#111111', sam from ids;
insert into projects (workspace_id, name, color, owner_member_id) select w, 'P2 private', '#222222', sam from ids;
insert into projects (workspace_id, name, color, owner_member_id) select w, 'P3 client', '#333333', sam from ids;
insert into project_members select p.id, m.id from projects p, workspace_members m where p.name = 'P1 with Omar' and m.email = 'omar@example.com';
insert into project_members select p.id, m.id from projects p, workspace_members m where p.name = 'P3 client' and m.email = 'julia@example.com';
insert into tasks (workspace_id, project_id, title, assignee_member_id, created_by_member) select w, (select id from projects where name='P1 with Omar'), 't1 in P1', sam, sam from ids;
insert into tasks (workspace_id, project_id, title, assignee_member_id, created_by_member) select w, (select id from projects where name='P2 private'), 't2 in P2', sam, sam from ids;
insert into tasks (workspace_id, project_id, title, assignee_member_id, created_by_member) select w, (select id from projects where name='P3 client'), 't4 in P3', sam, sam from ids;
insert into tasks (workspace_id, title, assignee_member_id, created_by_member) select w, 't3 no project, for Omar', (select id from workspace_members where email='omar@example.com'), sam from ids;
insert into goals (workspace_id, title, owner_member_id) select w, 'Goal linked to P2', sam from ids;
insert into goal_projects select g.id, p.id from goals g, projects p where p.name = 'P2 private';
select pg_temp.check((select count(*) from tasks) = 4, 'admin sees all 4 tasks');

-- Omar accepts (member): no personal workspace, sees P1 and his own task only
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from on_login(null)) = 1, 'invited person joins the workspace instead of getting a new one');
select pg_temp.check((select string_agg(name, ',' order by name) from projects) = 'P1 with Omar', 'member sees only projects he belongs to');
select pg_temp.check((select string_agg(title, ',' order by title) from tasks) = 't1 in P1,t3 no project, for Omar', 'member sees tasks of his projects and tasks assigned to him');
select pg_temp.check((select count(*) from goals) = 0, 'member does not see a goal of a project he is not in');
select pg_temp.check((select count(*) from workspace_members) = 4, 'member sees the list of people');
do $$ begin
  begin insert into projects (workspace_id, name, color) select workspace_id, 'nope', '#000' from workspace_members limit 1; raise exception 'FAILED: member created a project';
  exception when insufficient_privilege then raise notice 'ok  member cannot create projects'; end;
end $$;
update tasks set title = 'hacked' where title = 't2 in P2';
select pg_temp.check(not exists (select 1 from tasks where title = 'hacked'), 'member cannot change a task he cannot see');
insert into tasks (workspace_id, project_id, title, created_by_member)
  select workspace_id, (select id from projects where name='P1 with Omar'), 'Omar new task', id from workspace_members where user_id = auth.uid();
select pg_temp.check(exists (select 1 from tasks where title = 'Omar new task'), 'member can add a task to his project');

-- Julia accepts (guest): sees P3, cannot add or change
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select count(*) from on_login(null);
select pg_temp.check((select string_agg(name, ',') from projects) = 'P3 client', 'guest sees only her project');
do $$ begin
  begin insert into tasks (workspace_id, project_id, title, created_by_member)
    select workspace_id, (select id from projects limit 1), 'guest task', id from workspace_members where user_id = auth.uid();
    raise exception 'FAILED: guest added a task';
  exception when insufficient_privilege then raise notice 'ok  guest cannot add tasks'; end;
end $$;
update tasks set title = 'guest edit';
select pg_temp.check(not exists (select 1 from tasks where title = 'guest edit'), 'guest cannot edit tasks');

-- Karim accepts (manager): sees everything, can create projects
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select count(*) from on_login(null);
select pg_temp.check((select count(*) from projects) = 3 and (select count(*) from tasks) = 5 and (select count(*) from goals) = 1, 'manager sees every project, task and goal');
insert into projects (workspace_id, name, color) select workspace_id, 'Karim project', '#444' from workspace_members where user_id = auth.uid();
select pg_temp.check(exists (select 1 from projects where name = 'Karim project'), 'manager can create projects');
do $$ begin
  begin insert into workspace_members (workspace_id, email, display_name) select workspace_id, 'x@example.com', 'X' from workspace_members where user_id = auth.uid();
    raise exception 'FAILED: manager invited someone';
  exception when insufficient_privilege then raise notice 'ok  only admins invite people'; end;
end $$;

-- Profiles: each person saves their own name, title and picture; it reaches all their memberships
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select save_my_profile('Omar El-Sayed', 'Reservoir Engineer', '#3E9A94', 'https://example.com/omar.webp');
select pg_temp.check((select setup_done and full_name = 'Omar El-Sayed' from profiles where id = auth.uid()), 'a person saves their own profile');
select pg_temp.check((select display_name = 'Omar El-Sayed' and title = 'Reservoir Engineer' and avatar_url like 'https://%' from workspace_members where user_id = auth.uid()),
  'the profile reaches their membership in every workspace');
select pg_temp.check((select count(*) from profiles) = 1, 'people see only their own profile');
do $$ begin
  begin update workspace_members set display_name = 'Hacked' where email = 'sam@example.com';
    if exists (select 1 from workspace_members where display_name = 'Hacked') then raise exception 'FAILED: a member renamed someone else'; end if;
    raise notice 'ok  members cannot rename other people';
  exception when insufficient_privilege then raise notice 'ok  members cannot rename other people'; end;
  begin perform save_my_profile('  ', '', null, null); raise exception 'FAILED: empty name accepted';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  a name is required'; end;
  begin perform save_my_profile('Omar', '', null, 'javascript:alert(1)'); raise exception 'FAILED: odd picture address accepted';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  picture must be a web address'; end;
end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select save_my_profile('Sam Rivas Dorado', 'Senior Geoscientist', null, null);
select pg_temp.check((select name from workspaces where created_by = auth.uid()) = 'Sam Rivas Dorado’s workspace', 'the personal workspace follows the new name');

-- Images for project symbols and team badges: only people who may edit the project or team can upload
reset role;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into teams (workspace_id, name, color, lead_member_id) select w, 'Modelling', '#555', (select id from workspace_members where email = 'omar@example.com') from ids;
create temp table img as select w,
  (select id from projects where name = 'P1 with Omar') p1, (select id from teams where name = 'Modelling') t1 from ids;
insert into storage.objects (bucket_id, name) select 'images', w || '/projects/' || p1 || '/a.webp' from img;
select pg_temp.check(true, 'admin uploads a project image');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin insert into storage.objects (bucket_id, name) select 'images', w || '/projects/' || p1 || '/b.webp' from img;
    raise exception 'FAILED: a member changed the image of a project they do not own';
  exception when insufficient_privilege then raise notice 'ok  members cannot change project images'; end;
  begin insert into storage.objects (bucket_id, name) select 'images', w || '/projects/not-a-uuid/c.webp' from img;
    raise exception 'FAILED: odd image path accepted';
  exception when insufficient_privilege then raise notice 'ok  image paths must point at a real project or team'; end;
end $$;
insert into storage.objects (bucket_id, name) select 'images', w || '/teams/' || t1 || '/d.webp' from img;
select pg_temp.check(true, 'a team lead uploads the team badge');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  begin insert into storage.objects (bucket_id, name) select 'images', w || '/teams/' || t1 || '/e.webp' from img;
    raise exception 'FAILED: a guest changed a team badge';
  exception when insufficient_privilege then raise notice 'ok  others cannot change team badges'; end;
end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
do $$ begin
  begin insert into storage.objects (bucket_id, name) select 'images', w || '/projects/' || p1 || '/f.webp' from img;
    raise exception 'FAILED: a stranger uploaded into another workspace';
  exception when insufficient_privilege then raise notice 'ok  strangers cannot upload into a workspace'; end;
end $$;

-- Solo mode: only admins switch it
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update workspaces set solo = true;
select pg_temp.check(not exists (select 1 from workspaces where solo), 'members cannot switch solo mode');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update workspaces set solo = true where created_by = auth.uid();
select pg_temp.check((select solo from workspaces where created_by = auth.uid()), 'the admin switches solo mode');
update workspaces set solo = false where created_by = auth.uid();

-- More workspaces: anyone creates one and becomes its admin; a name and picture can differ per workspace
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
create temp table ws2 as select create_workspace('Omar side projects') id;
select pg_temp.check((select access from workspace_members where workspace_id = (select id from ws2) and user_id = auth.uid()) = 'admin', 'creating a workspace makes you its admin');
select pg_temp.check((select display_name from workspace_members where workspace_id = (select id from ws2) and user_id = auth.uid()) = 'Omar El-Sayed', 'a new workspace starts from your profile');
select pg_temp.check((select count(*) from field_options where workspace_id = (select id from ws2)) = 3, 'a new workspace gets the Priority dimension');
select save_my_membership((select id from ws2), 'Omar (personal)', 'Hobbyist', null, null);
select pg_temp.check((select display_name from workspace_members where workspace_id = (select id from ws2) and user_id = auth.uid()) = 'Omar (personal)'
  and (select display_name from workspace_members where workspace_id = (select w from ids) and user_id = auth.uid()) = 'Omar El-Sayed', 'a name can differ per workspace');
select pg_temp.check((select access from workspace_members where workspace_id = (select w from ids) and user_id = auth.uid()) = 'member', 'changing your name does not change your role');
do $$ begin
  begin perform save_my_membership(gen_random_uuid(), 'X', '', null, null); raise exception 'FAILED: renamed in a workspace they are not in';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  only in your own workspaces'; end;
  begin perform create_workspace('   '); raise exception 'FAILED: empty workspace name accepted';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  a workspace needs a name'; end;
end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(not exists (select 1 from workspaces where name = 'Omar side projects'), 'other people do not see your new workspace');

-- A stranger signs up: own empty workspace, sees nothing of Sam's
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select count(*) from on_login(null);
select pg_temp.check((select count(*) from projects) = 0 and (select count(*) from tasks) = 0 and (select count(*) from workspace_members) = 1, 'other workspaces are invisible');

reset role;

-- ---------------------------------------------------------------------
-- Invite-only gate
reset role;
create or replace function pg_temp.signup_ok(e text) returns boolean language plpgsql as $$
begin insert into auth.users values (gen_random_uuid(), e); return true;
exception when others then return false; end $$;
select pg_temp.check(not pg_temp.signup_ok('random@example.com'), 'an unknown address cannot create an account');
select pg_temp.check(not pg_temp.signup_ok('RANDOM@example.com'), 'an unknown address in capitals cannot either');
set role service_role;
select request_access('Newbie@Example.com', 'New Bie', 'hello');
select request_access('newbie@example.com');
reset role;
select pg_temp.check((select count(*) from access_requests where email = 'newbie@example.com' and status = 'pending') = 1, 'a request is stored once, as pending');
select pg_temp.check(not pg_temp.signup_ok('newbie@example.com'), 'a pending request cannot sign up');
update access_requests set status = 'approved' where email = 'newbie@example.com';
select pg_temp.check(pg_temp.signup_ok('Newbie@example.com'), 'an approved request can sign up');
insert into access_requests (email, status) values ('nope@example.com','declined');
select pg_temp.check(not pg_temp.signup_ok('nope@example.com'), 'a declined request cannot sign up');
select pg_temp.check(not (select email_may_sign_up('x@example.com')), 'email_may_sign_up says no to strangers');
set role anon;
do $$ begin
  begin perform 1 from access_requests; raise exception 'FAILED: anon can read requests';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
do $$ begin
  begin perform request_access('not an email'); raise exception 'FAILED: bad email accepted';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; end;
end $$;
reset role;

-- Approving works even where no email can be sent (no Vault key here)
select pg_temp.check((select decided_at is not null and emailed_at is null from access_requests where email = 'newbie@example.com'), 'approval is recorded and survives a missing email setup');

-- ---------------------------------------------------------------------
-- Approval email (the stand-in net.http_post records what would be sent)
insert into vault.decrypted_secrets values ('resend_api_key', 're_test');
insert into access_requests (email, name, status) values ('mail1@example.com', 'Mia <b>', 'pending');
select pg_temp.check((select count(*) from net.calls) = 0, 'a pending request sends no email');
update access_requests set status = 'approved' where email = 'mail1@example.com';
select pg_temp.check((select count(*) from net.calls where body->'to' = '["mail1@example.com"]'::jsonb and headers->>'Authorization' = 'Bearer re_test') = 1, 'approving sends one email to the requester');
select pg_temp.check((select body->>'html' from net.calls limit 1) like '%Mia &lt;b&gt;%' and (select emailed_at is not null from access_requests where email = 'mail1@example.com'), 'the name is escaped in the email and the send is recorded');
update access_requests set note = 'x' where email = 'mail1@example.com';
select pg_temp.check((select count(*) from net.calls) = 1, 'editing an approved request does not email again');
delete from vault.decrypted_secrets;
insert into access_requests (email, status) values ('mail2@example.com', 'pending');
update access_requests set status = 'approved' where email = 'mail2@example.com';
select pg_temp.check((select status from access_requests where email = 'mail2@example.com') = 'approved' and (select count(*) from net.calls) = 1 and (select emailed_at is null from access_requests where email = 'mail2@example.com'), 'without a Resend key the approval still works, silently');

-- The form is locked behind the CAPTCHA function (last migration): browsers cannot call it directly
set role anon;
do $$ begin
  begin perform request_access('late@example.com'); raise exception 'FAILED: anon can still call request_access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
select request_access('viaedge@example.com');
reset role;
select pg_temp.check(exists (select 1 from access_requests where email = 'viaedge@example.com'), 'the Edge Function role can still file a request');


-- ---------------------------------------------------------------------
-- Invitation email
delete from net.calls;
insert into vault.decrypted_secrets values ('resend_api_key', 're_test');
insert into workspace_members (workspace_id, email, display_name, access, invited_by)
  select w, 'newcolleague@example.com', 'Nia <x>', 'guest', sam from ids;
select pg_temp.check((select count(*) from net.calls where body->'to' = '["newcolleague@example.com"]'::jsonb) = 1, 'inviting someone emails them');
select pg_temp.check((select body->>'html' from net.calls limit 1) like '%Sam Rivas%' and (select body->>'html' from net.calls limit 1) like '%Nia &lt;x&gt;%', 'the email names the inviter and escapes the invited name');
select pg_temp.check((select invite_emailed_at is not null from workspace_members where email = 'newcolleague@example.com'), 'the send is recorded');
delete from net.calls;
insert into workspace_members (workspace_id, user_id, email, display_name, access, status)
  select w, '00000000-0000-0000-0000-00000000000e', 'someone@example.com', 'Someone', 'member', 'active' from ids;
select pg_temp.check((select count(*) from net.calls) = 0, 'adding an already-active person sends no invitation');
delete from vault.decrypted_secrets;
insert into workspace_members (workspace_id, email, display_name) select w, 'nokey@example.com', 'No Key' from ids;
select pg_temp.check((select count(*) from workspace_members where email = 'nokey@example.com') = 1 and (select count(*) from net.calls) = 0, 'without a Resend key the invitation is still saved');


-- ---------------------------------------------------------------------
-- Sign-up link in the emails, and "send again"
select pg_temp.check(join_link('a+b@x.com') = 'https://flightofthegoose.com/app/?join=1&email=a%2Bb%40x.com', 'the sign-up link carries the email address, encoded');
delete from net.calls; delete from vault.decrypted_secrets;
insert into vault.decrypted_secrets values ('resend_api_key', 're_test');
insert into access_requests (email, name) values ('link1@example.com', 'Lin');
update access_requests set status = 'approved' where email = 'link1@example.com';
select pg_temp.check((select body->>'html' from net.calls order by id desc limit 1) like '%?join=1&email=link1%40example.com%' and (select body->>'html' from net.calls order by id desc limit 1) like '%Create your account%', 'the approval email opens the create-account form');
insert into workspace_members (workspace_id, email, display_name, access, invited_by)
  select w, 'again@example.com', 'Again', 'member', sam from ids;
select pg_temp.check((select body->>'html' from net.calls order by id desc limit 1) like '%?join=1&email=again%40example.com%', 'the invitation email opens the create-account form');

set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform resend_invitation((select id from workspace_members where email = 'again@example.com'));
    raise exception 'FAILED: resent twice in a row';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; end;
end $$;
reset role;
update workspace_members set invite_emailed_at = now() - interval '1 hour' where email = 'again@example.com';
delete from net.calls;
set role authenticated;
select resend_invitation((select id from workspace_members where email = 'again@example.com'));
reset role;
select pg_temp.check((select count(*) from net.calls where body->'to' = '["again@example.com"]'::jsonb) = 1, 'an admin can send an invitation again');
select pg_temp.check((select invite_emailed_at > now() - interval '1 minute' from workspace_members where email = 'again@example.com'), 'sending again is recorded');
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin perform resend_invitation((select id from workspace_members where email = 'again@example.com'));
    raise exception 'FAILED: a member resent an invitation';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; end;
end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform resend_invitation((select member_id from ws));
    raise exception 'FAILED: invited someone who already joined';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- A project records when it was marked done, and forgets it when reopened
update projects set status = 'closed' where name = 'P3 client';
select pg_temp.check((select completed_at = current_date from projects where name = 'P3 client'), 'marking a project done records the day');
update projects set status = 'closed', completed_at = date '2026-01-15' where name = 'P2 private';
update projects set name = 'P2 private' , status = 'closed' where name = 'P2 private';
select pg_temp.check((select completed_at = date '2026-01-15' from projects where name = 'P2 private'), 'a done project keeps its day when saved again');
update projects set status = 'active' where name = 'P3 client';
select pg_temp.check((select completed_at is null from projects where name = 'P3 client'), 'reopening clears the day');

-- ---------------------------------------------------------------------
-- Comments: visible with the task, written by everyone but guests, edited only by their author
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into comments (workspace_id, task_id, author_member_id, body, mentions)
  select t.workspace_id, t.id, my_member_id(t.workspace_id), 'Sam on t1 @Omar', array[(select id from workspace_members where email = 'omar@example.com')] from tasks t where t.title = 't1 in P1';
insert into comments (workspace_id, task_id, author_member_id, body)
  select t.workspace_id, t.id, my_member_id(t.workspace_id), 'Sam on t2' from tasks t where t.title = 't2 in P2';
select pg_temp.check((select count(*) from comments) = 2, 'the author sees his comments');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select string_agg(body, ',') from comments) = 'Sam on t1 @Omar', 'a member sees comments only on tasks he can see');
insert into comments (workspace_id, task_id, author_member_id, body)
  select t.workspace_id, t.id, my_member_id(t.workspace_id), 'Omar replies' from tasks t where t.title = 't1 in P1';
select pg_temp.check((select count(*) from comments) = 2, 'a member can reply on a task he can see');
update comments set body = 'changed by Omar' where body = 'Sam on t1 @Omar';
select pg_temp.check(not exists (select 1 from comments where body = 'changed by Omar'), 'nobody edits someone else''s comment');
do $$ begin
  begin
    insert into comments (workspace_id, task_id, author_member_id, body)
      select workspace_id, id, (select id from workspace_members where email = 'omar@example.com'), 'sneaky' from tasks where false
      union all select (select workspace_id from workspace_members limit 1), (select id from tasks where title = 't1 in P1'), (select id from workspace_members where email = 'sam@example.com'), 'as Sam';
    raise exception 'FAILED: wrote a comment as someone else';
  exception when insufficient_privilege then raise notice 'ok  nobody writes a comment in someone else''s name'; end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Mentions in descriptions and notebooks: only the person mentioned (and the author) read them
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into mention_events (workspace_id, member_id, author_member_id, task_id, excerpt)
  select t.workspace_id, (select id from workspace_members where email = 'omar@example.com'), my_member_id(t.workspace_id), t.id, '@Omar see the description'
  from tasks t where t.title = 't1 in P1';
insert into mention_events (workspace_id, member_id, author_member_id, task_id, excerpt)
  select t.workspace_id, (select id from workspace_members where email = 'karim@example.com'), my_member_id(t.workspace_id), t.id, '@Karim private'
  from tasks t where t.title = 't1 in P1';
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select string_agg(excerpt, ',') from mention_events) = '@Omar see the description', 'a person sees only the mentions of himself');
do $$ begin
  begin
    insert into mention_events (workspace_id, member_id, author_member_id, task_id, excerpt)
      select t.workspace_id, (select id from workspace_members where email = 'sam@example.com'), (select id from workspace_members where email = 'sam@example.com'), t.id, 'fake'
      from tasks t where t.title = 't1 in P1';
    raise exception 'FAILED: wrote a mention in someone else''s name';
  exception when insufficient_privilege then raise notice 'ok  nobody writes a mention in someone else''s name'; end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Offers of help: to the assignee, in your own name; only the person helped accepts
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into help_offers (workspace_id, task_id, helper_member_id, helped_member_id)
  select t.workspace_id, t.id, my_member_id(t.workspace_id), t.assignee_member_id from tasks t where t.title = 't3 no project, for Omar';
select pg_temp.check((select count(*) from help_offers) = 1, 'someone offers help to the assignee');
do $$ begin
  begin
    update help_offers set status = 'accepted';
    raise exception 'FAILED: the helper accepted his own offer';
  exception when raise_exception then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  only the person helped accepts';
  end;
end $$;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update help_offers set status = 'accepted';
select pg_temp.check((select status = 'accepted' and answered_at is not null from help_offers), 'the person helped accepts the offer');
do $$ begin
  begin
    insert into help_offers (workspace_id, task_id, helper_member_id, helped_member_id)
      select t.workspace_id, t.id, my_member_id(t.workspace_id), (select id from workspace_members where email = 'karim@example.com') from tasks t where t.title = 't1 in P1';
    raise exception 'FAILED: offered help to someone who is not the task''s assignee';
  exception when insufficient_privilege or check_violation then raise notice 'ok  help can only be offered to the task''s assignee'; end;
end $$;
reset role;

-- goal tags: short names stay short, colours are hex
update goals set short_name = 'P2-GOAL', color = '#4A7FC1' where title = 'Goal linked to P2';
select pg_temp.check((select short_name = 'P2-GOAL' from goals where title = 'Goal linked to P2'), 'a goal keeps its short name');
do $$ begin
  begin update goals set short_name = 'TOO-LONG-1' where title = 'Goal linked to P2'; raise exception 'FAILED: saved a short name longer than 8 characters';
  exception when check_violation then raise notice 'ok  goal short names are at most 8 characters'; end;
  begin update goals set color = 'red' where title = 'Goal linked to P2'; raise exception 'FAILED: saved a colour that is not #RRGGBB';
  exception when check_violation then raise notice 'ok  goal colours are #RRGGBB'; end;
end $$;

-- recurring tasks: the dates, and the next task created when a repeating one is completed
select pg_temp.check(repeat_next_due('{"unit":"day","every":1,"from":"due"}', '2026-10-20', '2026-10-28') = '2026-10-29', 'late daily task: next one is tomorrow');
select pg_temp.check(repeat_next_due('{"unit":"weekday","every":1,"from":"due"}', '2026-10-30', '2026-10-30') = '2026-11-02', 'weekday task done on Friday: next is Monday');
select pg_temp.check(repeat_next_due('{"unit":"week","every":1,"days":[1,4],"from":"due"}', '2026-10-26', '2026-10-26') = '2026-10-29', 'Mon/Thu: Monday then Thursday');
select pg_temp.check(repeat_next_due('{"unit":"week","every":1,"days":[1,4],"from":"due"}', '2026-10-29', '2026-10-29') = '2026-11-02', 'Mon/Thu: Thursday then next Monday');
select pg_temp.check(repeat_next_due('{"unit":"week","every":2,"days":[3],"from":"due"}', '2026-10-28', '2026-10-28') = '2026-11-11', 'every 2 weeks on Wednesday');
select pg_temp.check(repeat_next_due('{"unit":"month","every":1,"dom":31,"from":"due"}', '2027-01-31', '2027-01-31') = '2027-02-28', 'the 31st becomes the last day of February');
select pg_temp.check(repeat_next_due('{"unit":"month","every":1,"dom":31,"from":"due"}', '2027-02-28', '2027-02-28') = '2027-03-31', 'and back to the 31st in March');
select pg_temp.check(repeat_next_due('{"unit":"year","every":1,"from":"due"}', '2028-02-29', '2028-02-29') = '2029-02-28', 'yearly on 29 Feb');
select pg_temp.check(repeat_next_due('{"unit":"week","every":2,"from":"done"}', '2026-10-01', '2026-10-28') = '2026-11-11', 'counted from completion');
select pg_temp.check(repeat_next_due('{"unit":"day","every":1,"from":"due","until":"2026-10-28"}', '2026-10-28', '2026-10-28') is null, 'stops after its end date');
select pg_temp.check(repeat_next_due('{"unit":"day","every":1,"from":"due","left":1}', '2026-10-28', '2026-10-28') is null, 'stops after its last time');
select pg_temp.check(repeat_next_due('{"unit":"month","every":3,"dom":15,"from":"due"}', null, '2026-10-28') = '2027-01-15', 'no due date: counted from completion');

set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into tasks (workspace_id, title, due_date, created_by_member, assignee_member_id, repeat)
  select w.id, 'Weekly report', current_date, my_member_id(w.id), my_member_id(w.id), '{"unit":"week","every":1,"from":"due","left":3}'
  from workspaces w where my_member_id(w.id) is not null limit 1;
insert into subtasks (task_id, title, done) select id, 'Collect numbers', true from tasks where title = 'Weekly report';
update tasks set status = 'done', completed_at = current_date where title = 'Weekly report' and status = 'todo';
select pg_temp.check((select count(*) from tasks where title = 'Weekly report') = 2, 'completing a repeating task creates the next one');
select pg_temp.check((select due_date = current_date + 7 and status = 'todo' and (repeat->>'left')::int = 2 from tasks where title = 'Weekly report' and status = 'todo'), 'the next one is due a week later, with one time fewer to go');
select pg_temp.check((select bool_and(not done) from subtasks s join tasks t on t.id = s.task_id where t.status = 'todo' and t.title = 'Weekly report'), 'its subtasks start unticked');
update tasks set status = 'todo', completed_at = null where title = 'Weekly report' and next_task_id is not null;
update tasks set status = 'done', completed_at = current_date where title = 'Weekly report' and next_task_id is not null;
select pg_temp.check((select count(*) from tasks where title = 'Weekly report') = 2, 'reopening and completing again does not create a second copy');
reset role;

select 'ALL ACCESS TESTS PASSED' as result;
