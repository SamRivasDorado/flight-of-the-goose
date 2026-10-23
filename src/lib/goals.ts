import { fmtDate } from './projects';
import { GOAL_STATUSES, type Goal, type Task } from './types';

export const goalStatus = (id: Goal['status']) => GOAL_STATUSES.find(s => s.id === id) ?? GOAL_STATUSES[0];

/** Tasks that count towards a goal: linked to it directly, or in one of its linked projects. */
export const goalTasks = (g: Goal, tasks: Task[]) => tasks.filter(t => t.goal_id === g.id || (t.project_id && g.project_ids.includes(t.project_id)));

/** Progress as in the prototype: done share of its tasks, else average of sub-goals, else the manual value. */
export function goalProgress(g: Goal, goals: Goal[], tasks: Task[]): number {
  if (g.status === 'achieved') return 100;
  const ts = goalTasks(g, tasks);
  if (ts.length) return Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100);
  const kids = goals.filter(k => k.parent_id === g.id);
  if (kids.length) return Math.round(kids.reduce((s, k) => s + goalProgress(k, goals, tasks), 0) / kids.length);
  return g.manual_progress || 0;
}

/** Where the progress number comes from, in words. */
export function progressSource(g: Goal, goals: Goal[], tasks: Task[]): string {
  if (g.status === 'achieved') return 'marked achieved';
  const ts = goalTasks(g, tasks);
  if (ts.length) {
    const d = ts.filter(t => t.goal_id === g.id).length;
    return d === ts.length ? `from ${d} directly linked task${d > 1 ? 's' : ''}` : d ? `from linked project tasks and ${d} direct task${d > 1 ? 's' : ''}` : 'from linked project tasks';
  }
  if (goals.some(k => k.parent_id === g.id)) return 'average of sub-goals';
  return 'set manually';
}

export const goalRange = (g: Goal) =>
  `${fmtDate(g.start_date, { month: 'short', year: 'numeric' })} – ${g.end_date ? fmtDate(g.end_date, { month: 'short', year: 'numeric' }) : 'open-ended'}`;

/** The calendar years a goal spans (open-ended goals run to next year), for the year tabs. */
export function goalYears(g: Goal): string[] {
  const a = +g.start_date.slice(0, 4), b = g.end_date ? +g.end_date.slice(0, 4) : Math.max(a, new Date().getFullYear() + 1);
  const out: string[] = [];
  for (let y = a; y <= b && out.length < 8; y++) out.push(String(y));
  return out;
}
