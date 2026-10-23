import { todayISO } from './data';

/** Turns YYYY-MM-DD into a local Date at midnight. */
export const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** Whole days from today to the date (negative = in the past). */
export const diffDays = (s: string) => Math.round((parseISO(s).getTime() - parseISO(todayISO()).getTime()) / 864e5);

/** How a due date reads in lists: Today, Tomorrow, Friday, 3 Nov… and the colour class to use. */
export function dueLabel(s: string | null, done = false): { text: string; cls: string } {
  if (!s) return { text: '', cls: '' };
  const d = diffDays(s), dt = parseISO(s), now = new Date();
  let text: string;
  if (d === 0) text = 'Today'; else if (d === 1) text = 'Tomorrow'; else if (d === -1) text = 'Yesterday';
  else if (d > 1 && d < 7) text = dt.toLocaleDateString('en-GB', { weekday: 'long' });
  else text = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(dt.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  const cls = done ? 'muted' : d < 0 ? 'overdue' : d <= 1 ? 'soon' : '';
  return { text, cls };
}

export const hrs = (h: number) => String(Math.round(h * 100) / 100);
export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
export const byDue = (a: { due_date: string | null }, b: { due_date: string | null }) =>
  (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : (a.due_date ?? '9999') > (b.due_date ?? '9999') ? 1 : 0;
