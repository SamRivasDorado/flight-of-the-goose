import { todayISO } from './data';
import { diffDays, parseISO } from './format';
import type { Project, Task } from './types';

export type Tone = 'good' | 'warn' | 'quiet' | 'bad' | 'idle';
export interface Health { label: string; color: string; tone: Tone }

/** Latest date something happened in the project: a task created or completed, or a notebook entry. */
export function lastActivity(p: Project, tasks: Task[], noteDates: { project_id: string; entry_date: string }[]): string | null {
  const today = todayISO();
  let last: string | null = null;
  const consider = (d: string | null | undefined) => { if (d && d <= today && (!last || d > last)) last = d; };
  tasks.filter(t => t.project_id === p.id).forEach(t => { consider(t.completed_at); consider(t.created_at?.slice(0, 10)); });
  noteDates.filter(n => n.project_id === p.id).forEach(n => consider(n.entry_date));
  return last;
}

/** Share of a fixed-term project's time that has passed (0–1). */
export function elapsed(p: Project): number {
  if (!p.start_date || !p.end_date) return 0;
  const s = parseISO(p.start_date).getTime(), e = parseISO(p.end_date).getTime(), n = parseISO(todayISO()).getTime();
  return e <= s ? 1 : Math.max(0, Math.min(1, (n - s) / (e - s)));
}

/** Project status, with the same rules as the prototype (explained on the Projects page). */
export function health(p: Project, tasks: Task[], noteDates: { project_id: string; entry_date: string }[]): Health {
  const ts = tasks.filter(t => t.project_id === p.id), open = ts.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  if (p.status === 'closed') return { label: 'Closed', color: '#7C8577', tone: 'idle' };
  if (p.status === 'paused') return { label: 'Paused', color: '#B89A6A', tone: 'idle' };
  if (p.kind === 'fixed' && p.end_date) {
    if (diffDays(p.end_date) < 0 && open.length) return { label: 'Past end date', color: '#C8634A', tone: 'bad' };
    const pct = ts.length ? ts.filter(t => t.status === 'done').length / ts.length : 0;
    if (overdue || elapsed(p) - pct > 0.25) return { label: 'At risk', color: '#E39A3E', tone: 'warn' };
    return { label: 'On track', color: '#6B9160', tone: 'good' };
  }
  const last = lastActivity(p, tasks, noteDates);
  if (overdue) return { label: `${overdue} overdue`, color: '#E39A3E', tone: 'warn' };
  if (!last || diffDays(last) < -30) return { label: 'Quiet', color: '#8A6440', tone: 'quiet' };
  return { label: 'Active', color: '#6B9160', tone: 'good' };
}

/** Tasks completed per week for the last n weeks (oldest first). */
export function weeklyDone(tasks: Task[], n = 12): number[] {
  const now = new Date(); const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const s = new Date(monday); s.setDate(s.getDate() - i * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    out.push(tasks.filter(t => t.completed_at && parseISO(t.completed_at) >= s && parseISO(t.completed_at) < e).length);
  }
  return out;
}

export const fmtDate = (s: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString('en-GB', o);
