-- Fix: creating a project, task or goal failed with
-- "new row violates row-level security policy".
-- The app reads the new row back right after saving it. The read rules
-- looked the row up again by id, and inside the same save the database
-- cannot see the row yet, so the read-back was refused. These rules now
-- check the row's own columns first, so a new row is visible at once.
-- Who can see what does not change.

drop policy if exists projects_read on projects;
create policy projects_read on projects for select using (
  sees_all(workspace_id)
  or owner_member_id = my_member_id(workspace_id)
  or can_see_project(id));

drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (
  sees_all(workspace_id)
  or assignee_member_id = my_member_id(workspace_id)
  or created_by_member  = my_member_id(workspace_id)
  or (project_id is not null and can_see_project(project_id))
  or can_see_task(id));

drop policy if exists goals_read on goals;
create policy goals_read on goals for select using (
  sees_all(workspace_id)
  or owner_member_id = my_member_id(workspace_id)
  or can_see_goal(id));
