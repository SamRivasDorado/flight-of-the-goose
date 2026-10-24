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

select 'ALL ACCESS TESTS PASSED' as result;
