import { todayISO } from './data';
import { parseISO } from './format';
import type { Project, Task } from './types';
import { daysSince, judge, overdueOf, STATUS, type Tone, type Verdict } from './status';

export type { Tone } from './status';
/** A project's status: label, colour and tone for the dot, and why (for the tooltip). */
export interface Health { label: string; color: string; tone: Tone; why: string; id: Verdict | 'done' | 'paused' }

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

/** Project status, with the rule shared with goals (lib/status.ts, explained in Help). */
export function health(p: Project, tasks: Task[], noteDates: { project_id: string; entry_date: string }[] = []): Health {
  const make = (id: Verdict | 'done' | 'paused', why: string): Health => ({ id, ...STATUS[id], why });
  if (p.status === 'closed') return make('done', 'marked complete');
  if (p.status === 'paused') return make('paused', 'paused in its settings');
  if (p.health_manual) return make(p.health_manual, 'set by hand in its settings');
  const today = todayISO();
  const ts = tasks.filter(t => t.project_id === p.id), open = ts.filter(t => t.status !== 'done');
  const last = [lastActivity(p, tasks, noteDates), p.created_at?.slice(0, 10)].filter((x): x is string => !!x && x <= today).sort().pop() ?? null;
  const facts = { ...overdueOf(ts, today), idle: daysSince(last, today) };
  if (p.kind === 'fixed' && p.end_date) {
    const pct = ts.length ? Math.round((ts.length - open.length) / ts.length * 100) : 0, el = Math.round(elapsed(p) * 100);
    const j = judge({ ...facts, behind: el - pct, pastEnd: p.end_date < today && open.length > 0 });
    return make(j.status, `${j.why} (${pct}% of tasks done, ${el}% of the time gone)`);
  }
  const j = judge({ ...facts, behind: null });
  return make(j.status, j.why);
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
