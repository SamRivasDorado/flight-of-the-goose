import { useCallback, useEffect, useState } from 'react';
import { db } from './supabase';
import { celebrateGoal, celebrateProject, celebrateTask } from './geese';
import type { Dim, FieldOption, Goal, GoalRef, Member, Note, NoteKind, Project, ProjectFull, Subtask, Task, Team, TaskFull, TeamRef } from './types';

/** Loads data for the current screen and reloads after a change. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setError(null); setData(await load()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

/** Today's date in the person's own time zone, as YYYY-MM-DD. */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// The database only returns rows this person may see (row-level security),
// so these queries never filter by visibility themselves.

export async function listMembers(ws: string): Promise<Member[]> {
  return check(await db().from('workspace_members').select('*').eq('workspace_id', ws).order('display_name'));
}

export async function listProjects(ws: string): Promise<Project[]> {
  return check(await db().from('projects').select('*').eq('workspace_id', ws).order('name'));
}

export async function listTasks(ws: string): Promise<Task[]> {
  return check(await db().from('tasks').select('*').eq('workspace_id', ws)
    .order('due_date', { ascending: true, nullsFirst: false }).order('created_at'));
}

// ---------- projects ----------

/** Projects with their members, shared teams and goals (only what this person may see). */
export async function listProjectsFull(ws: string): Promise<ProjectFull[]> {
  const projects = await listProjects(ws);
  if (!projects.length) return [];
  const ids = projects.map(p => p.id);
  const [pm, pt, gp] = await Promise.all([
    db().from('project_members').select('project_id, member_id').in('project_id', ids),
    db().from('project_teams').select('project_id, team_id').in('project_id', ids),
    db().from('goal_projects').select('project_id, goal_id').in('project_id', ids),
  ]);
  const m = check(pm) as { project_id: string; member_id: string }[];
  const t = check(pt) as { project_id: string; team_id: string }[];
  const g = check(gp) as { project_id: string; goal_id: string }[];
  return projects.map(p => ({ ...p,
    member_ids: m.filter(x => x.project_id === p.id).map(x => x.member_id),
    team_ids: t.filter(x => x.project_id === p.id).map(x => x.team_id),
    goal_ids: g.filter(x => x.project_id === p.id).map(x => x.goal_id) }));
}

export type ProjectInput = Pick<ProjectFull, 'name' | 'color' | 'icon' | 'kind' | 'status' | 'start_date' | 'end_date' | 'owner_member_id' | 'member_ids' | 'team_ids' | 'goal_ids'>;

/** Adds and removes link rows so the table matches the wanted list. */
async function syncLinks(table: string, key: string, projectId: string, col: string, before: string[], after: string[]) {
  const add = after.filter(x => !before.includes(x)), drop = before.filter(x => !after.includes(x));
  if (add.length) check(await db().from(table).insert(add.map(v => ({ [key]: projectId, [col]: v }))));
  if (drop.length) check(await db().from(table).delete().eq(key, projectId).in(col, drop));
}

/** Creates a project (existing = null) or saves changes to one, including its links. */
export async function saveProject(ws: string, existing: ProjectFull | null, d: ProjectInput): Promise<string> {
  const { member_ids, team_ids, goal_ids, ...row } = d;
  const p = existing
    ? check(await db().from('projects').update(row).eq('id', existing.id).select().single()) as Project
    : check(await db().from('projects').insert({ workspace_id: ws, ...row }).select().single()) as Project;
  await syncLinks('project_members', 'project_id', p.id, 'member_id', existing?.member_ids ?? [], member_ids.filter(x => x !== row.owner_member_id));
  await syncLinks('project_teams', 'project_id', p.id, 'team_id', existing?.team_ids ?? [], team_ids);
  await syncLinks('goal_projects', 'project_id', p.id, 'goal_id', existing?.goal_ids ?? [], goal_ids);
  if (existing && existing.status !== 'closed' && p.status === 'closed') celebrateProject(p.name);
  return p.id;
}

/** Marks a project done (status closed; the database records the day) or reopens it. */
export async function setProjectDone(p: Pick<Project, 'id' | 'name' | 'status'>, done: boolean) {
  check(await db().from('projects').update({ status: done ? 'closed' : 'active' }).eq('id', p.id).select('id').single());
  if (done && p.status !== 'closed') celebrateProject(p.name);
}

export async function deleteProject(id: string) {
  check(await db().from('projects').delete().eq('id', id));
}

export async function listTeamRefs(ws: string): Promise<TeamRef[]> {
  return check(await db().from('teams').select('id, name, color').eq('workspace_id', ws).order('name'));
}

// ---------- notebook ----------

export async function listNotes(projectId: string): Promise<Note[]> {
  return check(await db().from('notes').select('*').eq('project_id', projectId)
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false }));
}

/** Dates of notebook entries in the workspace, for "last activity" on project cards. */
export async function listNoteDates(ws: string): Promise<{ project_id: string; entry_date: string }[]> {
  return check(await db().from('notes').select('project_id, entry_date').eq('workspace_id', ws));
}

export async function addNote(ws: string, me: string, n: { project_id: string; entry_date: string; kind: NoteKind; body: string }): Promise<Note> {
  return check(await db().from('notes').insert({ workspace_id: ws, created_by_member: me, ...n }).select().single());
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'entry_date' | 'kind' | 'body'>>) {
  check(await db().from('notes').update(patch).eq('id', id));
}

export async function deleteNote(id: string) {
  check(await db().from('notes').delete().eq('id', id));
}

/** Tasks with their subtasks and collaborators (only what this person may see). */
export async function listTasksFull(ws: string): Promise<TaskFull[]> {
  const tasks = await listTasks(ws);
  if (!tasks.length) return [];
  const ids = tasks.map(t => t.id);
  const [subs, collabs] = await Promise.all([
    db().from('subtasks').select('*').in('task_id', ids).order('position'),
    db().from('task_collaborators').select('task_id, member_id').in('task_id', ids),
  ]);
  const s = check(subs) as Subtask[], c = check(collabs) as { task_id: string; member_id: string }[];
  return tasks.map(t => ({ ...t,
    subtasks: s.filter(x => x.task_id === t.id),
    collaborator_ids: c.filter(x => x.task_id === t.id).map(x => x.member_id) }));
}

export async function getTaskFull(id: string): Promise<TaskFull | null> {
  const { data, error } = await db().from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [subs, collabs] = await Promise.all([
    db().from('subtasks').select('*').eq('task_id', id).order('position'),
    db().from('task_collaborators').select('member_id').eq('task_id', id),
  ]);
  return { ...(data as Task), subtasks: check(subs) as Subtask[],
    collaborator_ids: (check(collabs) as { member_id: string }[]).map(c => c.member_id) };
}

export async function listGoalRefs(ws: string): Promise<GoalRef[]> {
  return check(await db().from('goals').select('id, title, parent_id').eq('workspace_id', ws).order('start_date'));
}

export async function createTask(ws: string, me: string, t: Partial<Task>): Promise<Task> {
  return check(await db().from('tasks')
    .insert({ workspace_id: ws, created_by_member: me, assignee_member_id: me, ...t }).select().single());
}

export async function deleteTask(id: string) {
  check(await db().from('tasks').delete().eq('id', id));
}

export async function addSubtask(taskId: string, title: string, position: number): Promise<Subtask> {
  return check(await db().from('subtasks').insert({ task_id: taskId, title, position }).select().single());
}

export async function updateSubtask(id: string, patch: Partial<Subtask>) {
  check(await db().from('subtasks').update(patch).eq('id', id));
}

export async function deleteSubtask(id: string) {
  check(await db().from('subtasks').delete().eq('id', id));
}

export async function setCollaborator(taskId: string, memberId: string, on: boolean) {
  if (on) check(await db().from('task_collaborators').insert({ task_id: taskId, member_id: memberId }));
  else check(await db().from('task_collaborators').delete().eq('task_id', taskId).eq('member_id', memberId));
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const p: Partial<Task> = { ...patch };
  if (patch.status) p.completed_at = patch.status === 'done' ? todayISO() : null;
  // only a task that was not done yet sends a goose
  const was = patch.status === 'done' ? (await db().from('tasks').select('status').eq('id', id).maybeSingle()).data?.status : null;
  const row = check(await db().from('tasks').update(p).eq('id', id).select().single());
  if (patch.status === 'done' && was && was !== 'done') void celebrateTask(id);
  return row;
}


// ---------- people ----------

/** Friendlier wording for database errors people can run into on the Team page. */
function friendly(msg: string) {
  if (/workspace_members_workspace_id_email_key|duplicate key.*email/i.test(msg)) return 'Someone with that email is already in this workspace.';
  return msg;
}

export async function updateMember(id: string, patch: Partial<Pick<Member, 'display_name' | 'title' | 'access' | 'email'>>) {
  const { error } = await db().from('workspace_members').update(patch).eq('id', id);
  if (error) throw new Error(friendly(error.message));
}

/** Removes a person from the workspace; projects they owned pass to `heir` (their tasks become unassigned). */
export async function removeMember(ws: string, id: string, heir: string) {
  check(await db().from('projects').update({ owner_member_id: heir }).eq('workspace_id', ws).eq('owner_member_id', id));
  check(await db().from('workspace_members').delete().eq('id', id));
}

export async function inviteMemberChecked(ws: string, me: string, m: Pick<Member, 'email' | 'display_name' | 'title' | 'access' | 'color'>): Promise<Member> {
  const { data, error } = await db().from('workspace_members').insert({ workspace_id: ws, invited_by: me, status: 'invited', ...m }).select().single();
  if (error) throw new Error(friendly(error.message));
  return data as Member;
}

// ---------- teams ----------

export async function listTeams(ws: string): Promise<Team[]> {
  const teams = check(await db().from('teams').select('*').eq('workspace_id', ws).order('name')) as Omit<Team, 'member_ids'>[];
  if (!teams.length) return [];
  const links = check(await db().from('team_members').select('team_id, member_id').in('team_id', teams.map(t => t.id))) as { team_id: string; member_id: string }[];
  return teams.map(t => ({ ...t, member_ids: links.filter(l => l.team_id === t.id).map(l => l.member_id) }));
}

export type TeamInput = Pick<Team, 'name' | 'color' | 'lead_member_id' | 'member_ids'>;

async function syncTeamMembers(teamId: string, before: string[], after: string[]) {
  const add = after.filter(id => !before.includes(id)), drop = before.filter(id => !after.includes(id));
  if (add.length) check(await db().from('team_members').insert(add.map(member_id => ({ team_id: teamId, member_id }))));
  if (drop.length) check(await db().from('team_members').delete().eq('team_id', teamId).in('member_id', drop));
}

/** Creates a team (existing = null) or saves changes, including who is in it. */
export async function saveTeam(ws: string, existing: Team | null, t: TeamInput): Promise<string> {
  const { member_ids, ...row } = t;
  const team = existing
    ? check(await db().from('teams').update(row).eq('id', existing.id).select().single()) as Team
    : check(await db().from('teams').insert({ workspace_id: ws, ...row }).select().single()) as Team;
  await syncTeamMembers(team.id, existing?.member_ids ?? [], member_ids);
  return team.id;
}

export async function deleteTeam(id: string) {
  check(await db().from('teams').delete().eq('id', id));
}

/** Adds or removes one person from several teams at once (Edit person dialog). */
export async function setPersonTeams(memberId: string, teams: Team[], wanted: string[]) {
  for (const t of teams) {
    const has = t.member_ids.includes(memberId), want = wanted.includes(t.id);
    if (has && !want) check(await db().from('team_members').delete().eq('team_id', t.id).eq('member_id', memberId));
    if (!has && want) check(await db().from('team_members').insert({ team_id: t.id, member_id: memberId }));
  }
}

// ---------- goals ----------

export async function listGoals(ws: string): Promise<Goal[]> {
  const goals = check(await db().from('goals').select('*').eq('workspace_id', ws).order('start_date').order('created_at')) as Omit<Goal, 'project_ids'>[];
  if (!goals.length) return [];
  const links = check(await db().from('goal_projects').select('goal_id, project_id').in('goal_id', goals.map(g => g.id))) as { goal_id: string; project_id: string }[];
  return goals.map(g => ({ ...g, project_ids: links.filter(l => l.goal_id === g.id).map(l => l.project_id) }));
}

export type GoalInput = Pick<Goal, 'title' | 'start_date' | 'end_date' | 'status' | 'parent_id' | 'owner_member_id' | 'manual_progress' | 'notes' | 'project_ids'>;

/** Creates a goal (existing = null) or saves changes, including its linked projects. */
export async function saveGoal(ws: string, existing: Goal | null, d: GoalInput): Promise<string> {
  const { project_ids, ...row } = d;
  const g = existing
    ? check(await db().from('goals').update(row).eq('id', existing.id).select().single()) as Goal
    : check(await db().from('goals').insert({ workspace_id: ws, ...row }).select().single()) as Goal;
  const before = existing?.project_ids ?? [];
  const add = project_ids.filter(x => !before.includes(x)), drop = before.filter(x => !project_ids.includes(x));
  if (add.length) check(await db().from('goal_projects').insert(add.map(project_id => ({ goal_id: g.id, project_id }))));
  if (drop.length) check(await db().from('goal_projects').delete().eq('goal_id', g.id).in('project_id', drop));
  if (existing && existing.status !== 'achieved' && g.status === 'achieved') celebrateGoal(g.title);
  return g.id;
}

/** Deletes a goal and its sub-goals; tasks linked to them stay, without a goal. */
export async function deleteGoal(id: string) {
  check(await db().from('goals').delete().eq('id', id));
}

// ---------- personal settings (saved dashboard charts, later palette and views) ----------

export async function getMySettings(memberId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db().from('member_settings').select('settings').eq('member_id', memberId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.settings as Record<string, unknown>) ?? {};
}

/** Merges the given keys into this person's settings. */
export async function saveMySettings(memberId: string, patch: Record<string, unknown>) {
  const cur = await getMySettings(memberId);
  check(await db().from('member_settings').upsert({ member_id: memberId, settings: { ...cur, ...patch } }).select().single());
}

// ---------- dimensions (Priority, Region, …) ----------

export async function listDims(ws: string): Promise<Dim[]> {
  const [f, o] = await Promise.all([
    db().from('fields').select('id, name, builtin, position').eq('workspace_id', ws).eq('is_dimension', true).eq('type', 'select').order('position').order('name'),
    db().from('field_options').select('id, field_id, label, color, position').eq('workspace_id', ws).order('position'),
  ]);
  const opts = check(o) as FieldOption[];
  return (check(f) as Omit<Dim, 'options'>[]).map(d => ({ ...d, options: opts.filter(x => x.field_id === d.id) }));
}

/** Task values and project defaults for every dimension (only rows this person may see). */
export async function listDimValues(): Promise<{ task: { task_id: string; field_id: string; option_id: string | null }[]; project: { project_id: string; field_id: string; option_id: string }[] }> {
  const [t, p] = await Promise.all([
    db().from('task_values').select('task_id, field_id, option_id').not('option_id', 'is', null),
    db().from('project_defaults').select('project_id, field_id, option_id'),
  ]);
  return { task: check(t) as never, project: check(p) as never };
}

export async function listCollaborations(): Promise<{ task_id: string; member_id: string }[]> {
  return check(await db().from('task_collaborators').select('task_id, member_id'));
}

export async function setTaskValue(taskId: string, fieldId: string, optionId: string | null) {
  if (optionId) check(await db().from('task_values').upsert({ task_id: taskId, field_id: fieldId, option_id: optionId, value: null }));
  else check(await db().from('task_values').delete().eq('task_id', taskId).eq('field_id', fieldId));
}

export async function setProjectDefault(projectId: string, fieldId: string, optionId: string | null) {
  if (optionId) check(await db().from('project_defaults').upsert({ project_id: projectId, field_id: fieldId, option_id: optionId }));
  else check(await db().from('project_defaults').delete().eq('project_id', projectId).eq('field_id', fieldId));
}

export async function createDim(ws: string, name: string, options: { label: string; color: string }[], position: number) {
  const f = check(await db().from('fields').insert({ workspace_id: ws, name, type: 'select', is_dimension: true, builtin: false, position }).select().single()) as { id: string };
  if (options.length) check(await db().from('field_options').insert(options.map((o, i) => ({ field_id: f.id, workspace_id: ws, label: o.label, color: o.color, position: i }))));
}
export async function renameDim(id: string, name: string) { check(await db().from('fields').update({ name }).eq('id', id)); }
export async function deleteDim(id: string) { check(await db().from('fields').delete().eq('id', id)); }
export async function addOption(ws: string, fieldId: string, label: string, color: string, position: number) {
  check(await db().from('field_options').insert({ field_id: fieldId, workspace_id: ws, label, color, position }));
}
export async function updateOption(id: string, patch: Partial<Pick<FieldOption, 'label' | 'color'>>) { check(await db().from('field_options').update(patch).eq('id', id)); }
export async function deleteOption(id: string) { check(await db().from('field_options').delete().eq('id', id)); }

// ---------- project and team images ----------

export async function setProjectImage(id: string, image_path: string | null, image_fit: 'fit' | 'fill') {
  check(await db().from('projects').update({ image_path, image_fit }).eq('id', id).select('id').single());
}
export async function setTeamImage(id: string, image_path: string | null) {
  check(await db().from('teams').update({ image_path }).eq('id', id).select('id').single());
}

/** Copies a task to another date: a new open task with the same project, goal, assignee, description,
    collaborators, dimension values and subtasks (all unticked); time spent starts at zero. */
export async function copyTask(ws: string, me: string, t: TaskFull, dueDate: string): Promise<Task> {
  const c = await createTask(ws, me, { title: t.title, description: t.description, project_id: t.project_id, goal_id: t.goal_id,
    assignee_member_id: t.assignee_member_id, due_date: dueDate, status: 'todo' });
  for (const [i, s] of t.subtasks.entries()) await addSubtask(c.id, s.title, i);
  for (const m of t.collaborator_ids) await setCollaborator(c.id, m, true);
  const vals = check(await db().from('task_values').select('field_id, option_id').eq('task_id', t.id)) as { field_id: string; option_id: string | null }[];
  for (const v of vals) if (v.option_id) await setTaskValue(c.id, v.field_id, v.option_id);
  return c;
}
