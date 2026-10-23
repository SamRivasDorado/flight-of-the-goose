# Teams and access: design decisions

Agreed while designing the prototype (version 6, October 2026). The database rules in `supabase/migrations` implement these.

## Accounts and workspaces
- Anyone can sign up with an email and gets their own workspace, where they are Admin: they work independently with their own goals, projects and tasks.
- An Admin can invite people by email. The invitee joins that workspace with the access level chosen (Admin, Manager, Member or Guest) and works with that level's permissions.
- One account can belong to several workspaces (their own plus each one they were invited to), with a workspace switcher. Access levels are per workspace.

## People on items
- Task: one assignee (responsible) plus optional collaborators.
- Project: one owner (project manager), members, optionally shared with whole teams (team members count as members, including later joiners). A project can optionally support one or more goals.
- Goal: one owner (accountable). "People involved" is derived from linked projects, directly linked tasks and sub-goal owners.
- Teams: name, colour, optional icon or image, optional lead; a person can be in several teams.

## Access levels
- Admin: everything, including inviting people and managing teams.
- Manager: sees everything in the workspace, creates goals and projects, reviews anyone's work. Edits teams they lead.
- Member: works on tasks in their projects. Cannot create projects or goals, import data or change dimensions. Review and Insights cover only tasks assigned to them.
- Guest: read-only on the projects they are a member of (for example a client).
- Job title is separate free text and controls nothing.

## Visibility rules for Members and Guests
- Project: visible to owner, members, and members of teams it is shared with. Membership gives the whole project (all tasks and notebook).
- Task: visible if its project is visible, or the person is assignee, collaborator or creator, or owns the goal the task is linked to.
- Goal: visible to its owner, and to anyone who sees one of its linked projects or directly linked tasks; sub-goals follow the same rule.
- Admins and Managers see everything.

## Scoping reports
- The Lens has Person and Team filters. Members and managers start with Person = me; guests start on their project's full view.
- Review and Insights: members are locked to their own assigned tasks; managers and admins can see anyone or anything.
- Further reporting for managers: postponed.

## Team screen
- Person-first: People view (cards with role, email, teams, load, projects, goals owned) and a "Who works on what" matrix (people × projects).
- A selected team shows a header (not a card): team image, name, lead, members, shared projects, settings and team review.
- "Who is on this item" lives on project and goal pages.
