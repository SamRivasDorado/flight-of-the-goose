/**
 * One status rule and one set of words for goals and projects.
 *
 * With an end date: compare how much is done with how much of the time has gone (both in %). The difference
 * is how many points behind (or ahead of) the calendar it is. Without an end date: this quarter's finished
 * tasks against last quarter's, compared with how much of the quarter has gone. Then:
 *   up to 10 points behind → On track · 11 to 25 → At risk · more than 25 → Off track
 * An overdue task turns On track into At risk; past the end date and not finished is Off track.
 * Explained in Help → "Status: on track or not".
 */
export const ON_TRACK_MAX = 10, AT_RISK_MAX = 25;

export type Verdict = 'on_track' | 'at_risk' | 'off_track';
export type Tone = 'good' | 'warn' | 'bad' | 'done' | 'idle';

/** The words and colours shared by goals and projects. */
export const STATUS: Record<Verdict | 'done' | 'paused', { label: string; color: string; tone: Tone }> = {
  on_track: { label: 'On track', color: '#6B9160', tone: 'good' },
  at_risk: { label: 'At risk', color: '#E39A3E', tone: 'warn' },
  off_track: { label: 'Off track', color: '#C8634A', tone: 'bad' },
  done: { label: 'Done', color: '#5B83B5', tone: 'done' },
  paused: { label: 'Paused', color: '#8A9099', tone: 'idle' },
};

/** The verdict for being `behind` points behind the calendar (negative: ahead), with `overdue` open tasks past their date. */
export function judge(behind: number, overdue = 0): Verdict {
  const v: Verdict = behind <= ON_TRACK_MAX ? 'on_track' : behind <= AT_RISK_MAX ? 'at_risk' : 'off_track';
  return v === 'on_track' && overdue > 0 ? 'at_risk' : v;
}

/** "3 points behind the calendar" / "12 points ahead of the calendar" / "level with the calendar" */
export const pointsText = (behind: number) => behind > 0 ? `${behind} point${behind === 1 ? '' : 's'} behind the calendar`
  : behind < 0 ? `${-behind} point${behind === -1 ? '' : 's'} ahead of the calendar` : 'level with the calendar';
export const overdueText = (n: number) => n ? `, ${n} overdue task${n === 1 ? '' : 's'}` : '';
