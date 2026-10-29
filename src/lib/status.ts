/**
 * One status rule and one set of words for goals and projects (explained in Help → "Status: on track or not").
 *
 * Anything with an end date (fixed-term projects, goals with an end date) is also measured against the calendar:
 * how much is done against how much of the time has gone, both in %; the difference is the points behind (or
 * ahead of) the calendar. Anything without one (ongoing projects, open-ended goals) is judged by overdue work and
 * activity only: no deadline, so "behind" does not apply.
 *
 *   Off track  past the end date and not finished · a task more than 14 days overdue · more than 25 points behind
 *   At risk    a task overdue · 11 to 25 points behind
 *   Quiet      none of the above, and nothing has happened for 15 days (information, not a warning)
 *   On track   otherwise
 */
export const ON_TRACK_MAX = 10, AT_RISK_MAX = 25, LATE_DAYS = 14, QUIET_DAYS = 15;

export type Verdict = 'on_track' | 'at_risk' | 'off_track' | 'quiet';
export type Tone = 'good' | 'warn' | 'bad' | 'done' | 'idle' | 'quiet';

/** The words and colours shared by goals and projects. */
export const STATUS: Record<Verdict | 'done' | 'paused', { label: string; color: string; tone: Tone }> = {
  on_track: { label: 'On track', color: '#6B9160', tone: 'good' },
  at_risk: { label: 'At risk', color: '#E39A3E', tone: 'warn' },
  off_track: { label: 'Off track', color: '#C8634A', tone: 'bad' },
  quiet: { label: 'Quiet', color: '#9A8566', tone: 'quiet' },
  done: { label: 'Done', color: '#5B83B5', tone: 'done' },
  paused: { label: 'Paused', color: '#8A9099', tone: 'idle' },
};

export interface Facts {
  /** Points behind the calendar (negative: ahead); null without an end date. */
  behind: number | null;
  /** Past the end date and not finished. */
  pastEnd?: boolean;
  /** Open tasks past their due date, and of those, how many by more than 14 days. */
  overdue: number;
  late: number;
  /** Days since anything happened (a task created or completed, a notebook entry); null if never. */
  idle: number | null;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const pointsText = (behind: number) => behind > 0 ? `${plural(behind, 'point')} behind the calendar`
  : behind < 0 ? `${plural(-behind, 'point')} ahead of the calendar` : 'level with the calendar';

/** The status and the reason in words (the most serious reason first). */
export function judge(f: Facts): { status: Verdict; why: string } {
  if (f.pastEnd) return { status: 'off_track', why: 'past its end date and not finished' };
  if (f.late) return { status: 'off_track', why: `${plural(f.late, 'task')} more than ${LATE_DAYS} days overdue` };
  if (f.behind != null && f.behind > AT_RISK_MAX) return { status: 'off_track', why: pointsText(f.behind) };
  if (f.overdue) return { status: 'at_risk', why: `${plural(f.overdue, 'overdue task')}` + (f.behind != null ? `, ${pointsText(f.behind)}` : '') };
  if (f.behind != null && f.behind > ON_TRACK_MAX) return { status: 'at_risk', why: pointsText(f.behind) };
  if (f.idle == null || f.idle >= QUIET_DAYS) return { status: 'quiet', why: f.idle == null ? 'nothing has happened yet' : `nothing has happened for ${f.idle} days` };
  return { status: 'on_track', why: f.behind != null ? pointsText(f.behind) : 'work is moving and nothing is overdue' };
}

/** Overdue and late (more than 14 days overdue) counts for some tasks. */
export function overdueOf(tasks: { status: string; due_date: string | null }[], today: string) {
  const lateDay = new Date(`${today}T12:00:00`); lateDay.setDate(lateDay.getDate() - LATE_DAYS);
  const lateIso = `${lateDay.getFullYear()}-${String(lateDay.getMonth() + 1).padStart(2, '0')}-${String(lateDay.getDate()).padStart(2, '0')}`;
  const open = tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today);
  return { overdue: open.length, late: open.filter(t => t.due_date! < lateIso).length };
}

/** Whole days between a past day and today; null when there is no day. */
export function daysSince(day: string | null | undefined, today: string): number | null {
  if (!day) return null;
  return Math.max(0, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${day.slice(0, 10)}T12:00:00`).getTime()) / 864e5));
}
