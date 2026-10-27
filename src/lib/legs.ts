/**
 * Legs: a goal's journey cut into quarters, like the stages of a migration.
 *
 * Every goal gets "stops": one per quarter of its life so far, with the tasks and projects
 * finished in it. An open-ended goal flies one leg per quarter: the flag is this quarter's end,
 * and reaching it means finishing as many of the goal's tasks as last quarter (its own pace).
 * The leg length is a quarter for now; LEG_MONTHS is the one place to change it later.
 */
import { goalProgress, goalTasks } from './goals';
import type { Goal, Project, Task } from './types';

export const LEG_MONTHS = 3;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);

export interface Leg { key: string; label: string; short: string; start: string; end: string }

/** The leg (quarter) a day falls in. */
export function legOf(day: string | Date): Leg {
  const d = typeof day === 'string' ? parse(day) : day;
  const m0 = Math.floor(d.getMonth() / LEG_MONTHS) * LEG_MONTHS;
  const s = new Date(d.getFullYear(), m0, 1), e = new Date(d.getFullYear(), m0 + LEG_MONTHS, 0);
  const n = m0 / LEG_MONTHS + 1;
  return { key: `${d.getFullYear()}-${n}`, label: `Q${n} ${d.getFullYear()}`, short: `Q${n}`, start: iso(s), end: iso(e) };
}
/** The leg before this one. */
export const prevLeg = (l: Leg) => legOf(new Date(parse(l.start).getTime() - 864e5));

/** Legs from a goal's start up to today (or its end, if earlier), oldest first. */
export function legsOf(g: Goal, today = iso(new Date())): Leg[] {
  const last = g.end_date && g.end_date < today ? g.end_date : today;
  const out: Leg[] = [];
  for (let l = legOf(g.start_date); l.start <= last && out.length < 40; l = legOf(new Date(parse(l.end).getTime() + 864e5))) out.push(l);
  return out;
}

/** The goal with its sub-goals: their tasks and projects count towards its activity too. */
const family = (g: Goal, goals: Goal[]) => [g, ...goals.filter(k => k.parent_id === g.id)];

export interface Stop { leg: Leg; tasks: number; projects: number; current: boolean }

/** Tasks and projects finished in each leg of the goal's life. */
export function stopsOf(g: Goal, goals: Goal[], tasks: Task[], projects: Project[], today = iso(new Date())): Stop[] {
  const fam = family(g, goals);
  const ts = new Map<string, Task>();
  fam.forEach(x => goalTasks(x, tasks).forEach(t => ts.set(t.id, t)));
  const pids = new Set(fam.flatMap(x => x.project_ids));
  const done = [...ts.values()].filter(t => t.status === 'done' && t.completed_at);
  const fin = projects.filter(p => pids.has(p.id) && p.status === 'closed' && p.completed_at);
  const cur = legOf(today).key;
  return legsOf(g, today).map(leg => ({
    leg, current: leg.key === cur,
    tasks: done.filter(t => t.completed_at! >= leg.start && t.completed_at! <= leg.end).length,
    projects: fin.filter(p => p.completed_at! >= leg.start && p.completed_at! <= leg.end).length,
  }));
}

export interface LegProgress {
  /** 0–100: share of the leg flown (this quarter's tasks against last quarter's). */
  pg: number;
  leg: Leg;
  done: number;
  /** Last quarter's count; null on the first leg, when there is no pace to compare with yet. */
  target: number | null;
  /** Share of the quarter's days gone, 0–100. */
  elapsed: number;
}

/** For an open-ended goal: how far this quarter's leg is flown. */
export function legProgress(g: Goal, goals: Goal[], tasks: Task[], projects: Project[], today = iso(new Date())): LegProgress {
  const stops = stopsOf(g, goals, tasks, projects, today);
  const leg = legOf(today);
  const now = stops.find(s => s.current), before = stops.find(s => s.leg.key === prevLeg(leg).key);
  const done = now?.tasks ?? 0;
  const target = before && before.tasks > 0 ? before.tasks : null;
  const span = parse(leg.end).getTime() - parse(leg.start).getTime() + 864e5;
  const elapsed = Math.max(0, Math.min(100, (parse(today).getTime() - parse(leg.start).getTime()) / span * 100));
  return { pg: target ? Math.min(100, Math.round(done / target * 100)) : 0, leg, done, target, elapsed };
}

/** Progress as the Strategy page shows it: the leg for open-ended goals, the whole goal otherwise. */
export function shownProgress(g: Goal, goals: Goal[], tasks: Task[], projects: Project[]): number {
  if (g.end_date || g.status === 'achieved') return goalProgress(g, goals, tasks);
  return legProgress(g, goals, tasks, projects).pg;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * For an ongoing project: this quarter's leg, flown by the tasks finished this quarter against
 * last quarter's count (its own pace). The first leg (no finished tasks last quarter) sets the pace.
 */
export function projectLeg(p: Project, tasks: Task[], today = iso(new Date())): LegProgress {
  const leg = legOf(today), prev = prevLeg(leg);
  const fin = tasks.filter(t => t.project_id === p.id && t.status === 'done' && t.completed_at);
  const count = (l: Leg) => fin.filter(t => t.completed_at! >= l.start && t.completed_at! <= l.end).length;
  const done = count(leg), before = count(prev);
  const target = before > 0 ? before : null;
  const span = parse(leg.end).getTime() - parse(leg.start).getTime() + 864e5;
  const elapsed = Math.max(0, Math.min(100, (parse(today).getTime() - parse(leg.start).getTime()) / span * 100));
  return { pg: target ? Math.min(100, Math.round(done / target * 100)) : 0, leg, done, target, elapsed };
}
