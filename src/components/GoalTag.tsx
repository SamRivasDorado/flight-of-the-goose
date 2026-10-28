import { colorOf, tagOf } from '../lib/goaltag';
import type { GoalRef } from '../lib/types';

/** A goal's small tag: the goal mark in its colour and its short name; the full title on hover.
    Dashed when the goal comes from the task's project rather than the task itself. */
export function GoalTag({ g, goals, inherited = false, more = 0 }: { g: GoalRef | undefined; goals: GoalRef[]; inherited?: boolean; more?: number }) {
  if (!g) return <span className="muted">—</span>;
  const parent = g.parent_id ? goals.find(x => x.id === g.parent_id) : undefined;
  const tip = `${g.title}${parent ? ` (part of ${parent.title})` : ''}${inherited ? ' · from the project' : ''}`;
  return (
    <span className="gtagw">
      <span className={`gtag ${inherited ? 'inh' : ''} ${g.parent_id ? 'sub' : ''}`} style={{ ['--c' as string]: colorOf(g, goals) }} title={tip}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" /><circle cx="6" cy="6" r="1.7" /></svg>{tagOf(g)}</span>
      {more > 0 && <span className="muted gmore" title={`Counts towards ${more} more goal${more > 1 ? 's' : ''}`}>+{more}</span>}
    </span>);
}
