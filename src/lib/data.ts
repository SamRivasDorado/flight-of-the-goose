import { useCallback, useEffect, useState } from 'react';
import { db } from './supabase';
import type { GoalRef, Member, Note, NoteKind, Project, ProjectFull, Subtask, Task, TaskFull, TeamRef } from './types';

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
  return p.id;
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
  return check(await db().from('tasks').update(p).eq('id', id).select().single());
}

export async function inviteMember(ws: string, me: string, m: Pick<Member, 'email' | 'display_name' | 'title' | 'access' | 'color'>) {
  // Phase 2 adds an email through a server function; until then the person
  // joins by signing in with this address (on_login accepts the invitation).
  return check(await db().from('workspace_members')
    .insert({ workspace_id: ws, invited_by: me, status: 'invited', ...m }).select().single());
}
