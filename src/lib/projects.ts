import { todayISO } from './data';
import { diffDays, parseISO } from './format';
import type { Project, Task } from './types';
import { judge, overdueText, pointsText, STATUS, type Tone, type Verdict } from './status';
import { projectLeg } from './legs';

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
export function health(p: Project, tasks: Task[], _noteDates?: unknown): Health {
  const make = (id: Verdict | 'done' | 'paused', why: string): Health => ({ id, ...STATUS[id], why });
  if (p.status === 'closed') return make('done', 'marked complete');
  if (p.status === 'paused') return make('paused', 'paused in its settings');
  const ts = tasks.filter(t => t.project_id === p.id), open = ts.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  if (p.health_manual) return make(p.health_manual, 'set by hand in its settings');
  if (p.kind === 'fixed' && p.end_date) {
    if (diffDays(p.end_date) < 0 && open.length) return make('off_track', `past its end date with ${open.length} open task${open.length === 1 ? '' : 's'}`);
    const pct = ts.length ? Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100) : 0, el = Math.round(elapsed(p) * 100);
    return make(judge(el - pct, overdue), `${pct}% of tasks done with ${el}% of the time gone: ${pointsText(el - pct)}${overdueText(overdue)}`);
  }
  // ongoing: this quarter's pace against last quarter's
  const lp = projectLeg(p, tasks);
  if (lp.target == null) return make(judge(0, overdue), `${lp.leg.label} is the first leg: it sets the pace${overdueText(overdue)}`);
  const behind = Math.round(lp.elapsed) - lp.pg;
  return make(judge(behind, overdue), `${lp.done} of ${lp.target} tasks (last quarter's pace) with ${Math.round(lp.elapsed)}% of the quarter gone: ${pointsText(behind)}${overdueText(overdue)}`);
}

/** Days since anything happened, when it is more than 30 (an ongoing project gone quiet), else null. */
export function quietDays(p: Project, tasks: Task[], noteDates: { project_id: string; entry_date: string }[]): number | null {
  if (p.status !== 'active') return null;
  const last = lastActivity(p, tasks, noteDates);
  const d = last ? -diffDays(last) : null;
  return d != null && d > 30 ? d : null;
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
