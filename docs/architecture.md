# Architecture

## Overview

```
Browser (React app, static files on Cloudflare Pages)
   │  supabase-js: sign-in, queries, file uploads
   ▼
Supabase (EU region)
   ├─ Auth: email links, invitations
   ├─ Postgres: all data, with row-level security (RLS)
   ├─ Storage: project and team images (phase 3)
   └─ Edge Functions: invitation and notification emails (phase 2)
```

There is no separate application server. The browser talks to the database directly, and **row-level security decides every row a person can read or change**. This keeps the system small, and it means a bug in the page cannot leak data: the database never sends it.

## Data model

Everything belongs to a **workspace**. A person inside a workspace is a row in `workspace_members` with an access level; it links to a login (`auth.users`) once the invitation is accepted, so people can be assigned work before they join.

| Area | Tables |
|---|---|
| Accounts | `profiles`, `workspaces`, `workspace_members`, `member_settings` |
| Teams | `teams`, `team_members` |
| Dimensions and fields | `fields` (dimension or extra field), `field_options` |
| Strategy | `goals` (with `parent_id` for sub-goals), `goal_projects` |
| Projects | `projects`, `project_members`, `project_teams`, `project_defaults`, `project_fields`, `notes` |
| Tasks | `tasks`, `task_collaborators`, `task_values`, `subtasks` |

## Security rules

Implemented in `supabase/migrations/20261023000000_init.sql` with helper functions:

- `sees_all(ws)`: admins and managers see everything in the workspace.
- `can_see_project(p)`: owner, members, or members of a team the project is shared with.
- `can_see_task(t)`: its project is visible, or the person is assignee, collaborator or creator, or owns the goal it is linked to.
- `can_see_goal(g)`: owner, or anyone who sees a linked project or directly linked task (sub-goals included).
- `can_edit(ws)`: everyone except guests may add and change what they can see.
- Only admins invite and manage people; managers create projects, goals and teams; team leads edit their team.

Members see only their own assigned tasks in Review and Insights; that filter is applied by the app on top of the visibility rules.

## Sign-in flow

1. The person enters an email; Supabase sends a sign-in link (new emails create an account).
2. After the link is opened, the app calls `on_login()`, which creates the profile, accepts any invitations sent to that email, and creates a personal workspace (with the built-in Priority dimension) if the person has none.
3. People in several workspaces switch between them from the top bar.
