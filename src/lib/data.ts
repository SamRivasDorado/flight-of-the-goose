import { useCallback, useEffect, useState } from 'react';
import { db } from './supabase';
import type { GoalRef, Member, Project, Subtask, Task, TaskFull } from './types';

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

export async function createProject(ws: string, me: string, p: Pick<Project, 'name' | 'color' | 'kind'>) {
  return check(await db().from('projects').insert({ workspace_id: ws, owner_member_id: me, ...p }).select().single());
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
