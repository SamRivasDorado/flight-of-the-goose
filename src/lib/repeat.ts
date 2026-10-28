/**
 * Recurring tasks. A repeating task carries a rule; when it is completed, the next one is created
 * (by the database, so it works however the task is completed) with the next due date, the same
 * project, goal, people, dimensions and subtasks (unticked). Only one task of a series is open at a time.
 *
 * The same calculation lives in the database (migration 20261029100000_recurring_tasks.sql, next_due)
 * and here (the panel's "Next:" preview and the prototype). Keep them in step.
 */
export type RepeatUnit = 'day' | 'weekday' | 'week' | 'month' | 'year';
export interface Repeat {
  unit: RepeatUnit;
  /** Every N days/weeks/months/years (1 = every). */
  every: number;
  /** Weeks: the days it falls on, 1 = Monday … 7 = Sunday. */
  days?: number[];
  /** Months: the day of the month (31 = the last day in shorter months). */
  dom?: number;
  /** 'due': on a fixed schedule from the due date; 'done': counted from the day it is completed. */
  from: 'due' | 'done';
  /** Stop after this date. */
  until?: string | null;
  /** Stop after this many more (this one included). */
  left?: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
/** 1 = Monday … 7 = Sunday */
export const isoDow = (d: Date) => ((d.getDay() + 6) % 7) + 1;
const monthDay = (y: number, m: number, dom: number) => new Date(y, m, Math.min(dom, new Date(y, m + 1, 0).getDate()), 12);

/** The occurrence after `base` (one step of the rule). */
function step(r: Repeat, base: Date): Date {
  const n = Math.max(1, r.every || 1);
  switch (r.unit) {
    case 'day': return add(base, n);
    case 'weekday': { let d = add(base, 1); while (isoDow(d) > 5) d = add(d, 1); return d; }
    case 'week': {
      const days = [...new Set(r.days ?? [])].filter(x => x >= 1 && x <= 7).sort((a, b) => a - b);
      if (!days.length) return add(base, 7 * n);
      const later = days.find(x => x > isoDow(base));
      if (later) return add(base, later - isoDow(base));
      const monday = add(base, 1 - isoDow(base));
      return add(monday, 7 * n + days[0] - 1);
    }
    case 'month': return monthDay(base.getFullYear(), base.getMonth() + n, r.dom ?? base.getDate());
    case 'year': return monthDay(base.getFullYear() + n, base.getMonth(), base.getDate());
  }
}

/**
 * The next due date when a task with this rule and due date is completed on `doneOn`, or null when the series ends.
 * The next one is always after the day it is completed: on a fixed schedule, dates already past are skipped,
 * so finishing late does not pile up overdue copies.
 */
export function nextDue(r: Repeat, due: string | null, doneOn: string): string | null {
  if (r.left != null && r.left <= 1) return null;
  const today = day(doneOn);
  let d = step(r, r.from === 'done' || !due ? today : day(due));
  for (let i = 0; d <= today && i < 1000; i++) d = step(r, d);
  const out = iso(d);
  return r.until && out > r.until ? null : out;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** "Every week on Mon, Thu", "Every 2 months on the 15th", "Every day, counted from when it is done". */
export function describe(r: Repeat, due?: string | null): string {
  const n = Math.max(1, r.every || 1), each = (one: string, many: string) => (n === 1 ? `Every ${one}` : `Every ${n} ${many}`);
  let s: string;
  switch (r.unit) {
    case 'day': s = each('day', 'days'); break;
    case 'weekday': s = 'Every weekday (Mon–Fri)'; break;
    case 'week': s = each('week', 'weeks') + (r.days?.length ? ` on ${[...r.days].sort((a, b) => a - b).map(x => DOW[x - 1]).join(', ')}` : ''); break;
    case 'month': { const dom = r.dom ?? (due ? day(due).getDate() : null); s = each('month', 'months') + (dom ? ` on the ${ord(dom)}` : ''); break; }
    case 'year': s = each('year', 'years') + (due ? ` on ${day(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''); break;
  }
  if (r.from === 'done') s += ', counted from when it is done';
  if (r.until) s += `, until ${day(r.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (r.left != null) s += r.left <= 1 ? ', this is the last one' : `, this one and ${r.left - 1} more`;
  return s;
}

/** The quick choices in the Repeat menu, made to fit the task's due date (or today). */
export function presets(due: string | null): [string, string, Repeat][] {
  const d = day(due ?? iso(new Date())), dow = isoDow(d);
  return [
    ['daily', 'Every day', { unit: 'day', every: 1, from: 'due' }],
    ['weekdays', 'Every weekday (Mon–Fri)', { unit: 'weekday', every: 1, from: 'due' }],
    ['weekly', `Every week on ${DOW[dow - 1]}`, { unit: 'week', every: 1, days: [dow], from: 'due' }],
    ['biweekly', `Every 2 weeks on ${DOW[dow - 1]}`, { unit: 'week', every: 2, days: [dow], from: 'due' }],
    ['monthly', `Every month on the ${ord(d.getDate())}`, { unit: 'month', every: 1, dom: d.getDate(), from: 'due' }],
    ['yearly', `Every year on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, { unit: 'year', every: 1, from: 'due' }],
  ];
}

/** Which preset a rule is, if any ('' when it is a custom rule). */
export function presetOf(r: Repeat | null, due: string | null): string {
  if (!r) return 'none';
  const same = (a: Repeat, b: Repeat) => a.unit === b.unit && (a.every || 1) === (b.every || 1) && a.from === b.from && !a.until && a.left == null
    && JSON.stringify([...(a.days ?? [])].sort()) === JSON.stringify([...(b.days ?? [])].sort()) && (a.unit !== 'month' || (a.dom ?? null) === (b.dom ?? null));
  return presets(due).find(([, , p]) => same(r, p))?.[0] ?? 'custom';
}
