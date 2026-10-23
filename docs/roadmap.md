# Roadmap

## Phase 1: Foundation (in progress)
- [x] Database schema for workspaces, people, teams, goals, projects, tasks, notebook, dimensions
- [x] Security rules (row-level security) with automated access tests
- [x] Email sign-in, personal workspace on first login, invitation acceptance
- [x] App shell with navigation and palettes from the prototype
- [x] Projects (list, create), Tasks (list, add, edit, complete), Team (list, invite)
- [ ] Task details panel (subtasks, collaborators, dimensions, description)
- [ ] Project pages with notebook, list, board and calendar
- [ ] Strategy (goals, sub-goals, owners, linked projects and tasks)
- [ ] Timeline
- [ ] Lens filters (person, team, project, dimensions)

## Phase 2: Working together
- [ ] Invitation emails (Edge Function + mail service)
- [ ] Teams screen (people view, who-works-on-what matrix, team header and settings)
- [ ] Project members and teams, goal owners
- [ ] Review (date ranges, summary) and Insights with member restrictions
- [ ] Live updates when colleagues change something

## Phase 3: Polish and launch
- [ ] Excel and CSV import and export
- [ ] Image uploads for projects and teams (Storage)
- [ ] Notification emails
- [ ] Privacy policy, account and data deletion (GDPR)
- [ ] Custom domain, production Supabase plan with backups
- [ ] Trial with a few colleagues

## Later
- [ ] Desktop app (Tauri) and installable web app
- [ ] Calendar integration
- [ ] Manager reports per project and goal
