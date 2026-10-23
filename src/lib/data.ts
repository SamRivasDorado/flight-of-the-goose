import { useCallback, useEffect, useState } from 'react';
import { db } from './supabase';
import type { Member, Project, Task } from './types';

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

export async function createTask(ws: string, me: string, t: Partial<Task>) {
  return check(await db().from('tasks')
    .insert({ workspace_id: ws, created_by_member: me, assignee_member_id: me, ...t }).select().single());
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const p: Partial<Task> = { ...patch };
  if (patch.status) p.completed_at = patch.status === 'done' ? new Date().toISOString().slice(0, 10) : null;
  return check(await db().from('tasks').update(p).eq('id', id).select().single());
}

export async function inviteMember(ws: string, me: string, m: Pick<Member, 'email' | 'display_name' | 'title' | 'access' | 'color'>) {
  // Phase 2 adds an email through a server function; until then the person
  // joins by signing in with this address (on_login accepts the invitation).
  return check(await db().from('workspace_members')
    .insert({ workspace_id: ws, invited_by: me, status: 'invited', ...m }).select().single());
}
