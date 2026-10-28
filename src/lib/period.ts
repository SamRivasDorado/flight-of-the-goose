/**
 * Periods for Insights: a span of days the numbers and charts are taken from.
 * A finished task belongs to the day it was completed; an open task to its due date
 * (or the day it was created, if it has none). Hours sit on tasks, so they follow the same rule.
 */
import type { Task } from './types';

export type PeriodKind = 'thisWeek' | 'lastWeek' | 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter'
  | 'thisYear' | 'lastYear' | 'all' | 'custom';
/** A period; a custom one remembers how the arrows step it (by whole months, or by weeks, or by its own length). */
export interface Period { kind: PeriodKind; from?: string; to?: string; months?: number; week?: boolean }

/** The same choices on Review and Insights. */
export const PERIODS: [PeriodKind, string][] = [
  ['thisWeek', 'This week'], ['lastWeek', 'Last week'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['last90', 'Last 90 days'],
  ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['thisQuarter', 'This quarter'], ['lastQuarter', 'Last quarter'],
  ['thisYear', 'This year'], ['lastYear', 'Last year'], ['all', 'All time'], ['custom', 'Choose dates…'],
];
export const periodName = (p: Period) => p.kind === 'custom' ? 'Chosen dates' : PERIODS.find(x => x[0] === p.kind)?.[1] ?? '';

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The day a task belongs to: completed, else due, else created. */
export const taskDay = (t: Pick<Task, 'status' | 'completed_at' | 'due_date' | 'created_at'>) =>
  ((t.status === 'done' && t.completed_at) || t.due_date || t.created_at || '').slice(0, 10);

/** First and last day of a period (inclusive). All time runs from the earliest to the latest task day (or today). */
export function range(p: Period, earliest?: string, latest?: string, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear(), m = today.getMonth(), q = Math.floor(m / 3) * 3, t = iso(today);
  const mon = addDays(today, -((today.getDay() + 6) % 7));
  switch (p.kind) {
    case 'thisWeek': return { from: iso(mon), to: iso(addDays(mon, 6)) };
    case 'lastWeek': return { from: iso(addDays(mon, -7)), to: iso(addDays(mon, -1)) };
    case 'last7': return { from: iso(addDays(today, -6)), to: t };
    case 'last30': return { from: iso(addDays(today, -29)), to: t };
    case 'last90': return { from: iso(addDays(today, -89)), to: t };
    case 'thisMonth': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'lastMonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'thisQuarter': return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) };
    case 'lastQuarter': return { from: iso(new Date(y, q - 3, 1)), to: iso(new Date(y, q, 0)) };
    case 'thisYear': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'lastYear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'all': return { from: earliest && earliest < t ? earliest : t, to: latest && latest > t ? latest : t };
    case 'custom': {
      const from = p.from || iso(addDays(today, -29)), to = p.to || t;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

export const inRange = (s: string, r: { from: string; to: string }) => !!s && s >= r.from && s <= r.to;

/** "1 Jul – 30 Sep 2026" */
export function rangeLabel(r: { from: string; to: string }) {
  const a = day(r.from), b = day(r.to), same = a.getFullYear() === b.getFullYear();
  const f = (d: Date, yr: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(yr ? { year: 'numeric' } : {}) });
  return r.from === r.to ? f(a, true) : `${f(a, !same)} – ${f(b, true)}`;
}

/** Whether "completed over time" goes by week (spans up to about four months) or by month. */
export const byWeek = (r: { from: string; to: string }) => (day(r.to).getTime() - day(r.from).getTime()) / 864e5 <= 120;

/** Buckets for "completed over time": weeks for spans up to about four months, months beyond. */
export function buckets(r: { from: string; to: string }): { label: string; from: string; to: string }[] {
  const a = day(r.from), b = day(r.to);
  const out: { label: string; from: string; to: string }[] = [];
  if (byWeek(r)) {
    for (let s = addDays(a, -((a.getDay() + 6) % 7)); s <= b && out.length < 30; s = addDays(s, 7)) {
      const e = addDays(s, 6);
      out.push({ label: s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), from: iso(s < a ? a : s), to: iso(e > b ? b : e) });
    }
  } else {
    for (let s = new Date(a.getFullYear(), a.getMonth(), 1); s <= b && out.length < 120; s = new Date(s.getFullYear(), s.getMonth() + 1, 1)) {
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      out.push({ label: s.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), from: iso(s < a ? a : s), to: iso(e > b ? b : e) });
    }
  }
  return out;
}

/** The period before (d = -1) or after (d = 1): whole months, quarters and years step as such, weeks by 7 days, others by their length. */
export function shiftPeriod(p: Period, r: { from: string; to: string }, d: number): Period {
  const k = p.kind;
  const months = k === 'custom' ? (p.months ?? 0) : /Month/.test(k) ? 1 : /Quarter/.test(k) ? 3 : /Year/.test(k) ? 12 : 0;
  const week = k === 'custom' ? !!p.week : /Week/.test(k);
  let A: Date, B: Date;
  if (months) { const s0 = day(r.from); A = new Date(s0.getFullYear(), s0.getMonth() + d * months, 1); B = new Date(A.getFullYear(), A.getMonth() + months, 0); }
  else { const n = week ? 7 : Math.round((day(r.to).getTime() - day(r.from).getTime()) / 864e5) + 1; A = addDays(day(r.from), d * n); B = addDays(day(r.to), d * n); }
  return { kind: 'custom', from: iso(A), to: iso(B), months, week };
}
