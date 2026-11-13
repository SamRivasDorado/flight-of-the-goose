/**
 * The written summary on the Review page: Goose puts the period's facts into a few plain sentences
 * itself (no AI, nothing leaves the browser). The plain list is still offered next to it.
 */
import { hrs } from './format';

export interface SummaryFacts {
  period: string;                 // "This week"
  range: string;                  // "9 – 15 Nov 2026"
  done: { title: string; project?: string }[];
  hours: number;
  time: { label: string; h: number; n: number }[];          // by project, most first
  moved: { name: string; from: number; to: number }[];      // goals (and projects) that moved in the period
  worried: { name: string; label: string }[];               // goals at risk / off track
  slipped: { title: string; project?: string }[];
  quiet: string[];
  upcoming: { title: string; project?: string; when: string }[] | null;
  upRange: string;
}

const list = (xs: string[], max = 3) => {
  const shown = xs.slice(0, max), more = xs.length - shown.length;
  const body = shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')}${more ? ', ' : ' and '}${shown[shown.length - 1]}`;
  return more ? `${body} and ${more} more` : body;
};
const withProject = (t: { title: string; project?: string }) => (t.project ? `${t.title} (${t.project})` : t.title);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function writeSummary(f: SummaryFacts): string {
  const out: string[] = [];

  // what was done, and where the time went
  let p = `${f.period} (${f.range}): `;
  if (!f.done.length) p += 'no tasks were completed.';
  else {
    p += `${plural(f.done.length, 'task')} completed${f.hours ? `, ${hrs(f.hours)} h logged` : ''}.`;
    const top = f.time.filter(r => r.label !== 'No project');
    if (f.hours && top[0]?.h) {
      if (top[0].h >= f.hours) p += ` All of it went to ${top[0].label}.`;
      else {
        p += ` Most of the time went to ${top[0].label} (${hrs(top[0].h)} of ${hrs(f.hours)} h)`;
        p += top[1]?.h ? `, then ${top[1].label} (${hrs(top[1].h)} h).` : '.';
      }
    } else if (top.length) p += ` Most of the work was on ${list(top.slice(0, 2).map(r => r.label))}.`;
    p += ` Done: ${list(f.done.map(withProject), 4)}.`;
  }
  out.push(p);

  // progress
  const reached = f.moved.filter(m => m.to >= 100), grew = f.moved.filter(m => m.to < 100);
  const prog = [
    ...reached.map(m => `${m.name} reached 100%`),
    ...grew.map(m => `${m.name} moved from ${m.from}% to ${m.to}%`),
  ];
  if (prog.length) out.push(`Progress: ${list(prog, 4)}.`);

  // what needs attention
  const watch: string[] = [];
  if (f.slipped.length) watch.push(f.slipped.length === 1 ? `1 task is overdue: ${withProject(f.slipped[0])}.`
    : `${f.slipped.length} tasks are overdue, including ${list(f.slipped.map(withProject), 3).replace(/ and \d+ more$/, '')}.`);
  const byLabel = new Map<string, string[]>();
  f.worried.forEach(w => byLabel.set(w.label, [...(byLabel.get(w.label) ?? []), w.name]));
  byLabel.forEach((names, label) => watch.push(`${label}: ${list(names, 4)}.`));
  if (f.quiet.length) watch.push(`No activity on ${list(f.quiet)}.`);
  out.push(watch.length ? `Needs attention. ${watch.join(' ')}` : 'Nothing needs attention: no task is overdue.');

  // what is next
  if (f.upcoming) {
    if (!f.upcoming.length) out.push(`Nothing is scheduled for ${f.upRange}.`);
    else {   // by day: "Mon 16 Nov: A, B; Tue 17 Nov: C"
      const shown = f.upcoming.slice(0, 6), days = new Map<string, string[]>();
      shown.forEach(t => days.set(t.when, [...(days.get(t.when) ?? []), t.title]));
      const more = f.upcoming.length - shown.length;
      out.push(`Coming up (${f.upRange}): ${[...days].map(([d, ts]) => `${d}: ${ts.join(', ')}`).join('; ')}${more ? `; and ${more} more` : ''}.`);
    }
  }

  return out.join('\n\n');
}
