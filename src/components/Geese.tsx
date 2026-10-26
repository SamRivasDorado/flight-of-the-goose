import { gooseMarkup } from '../lib/geese';
import { goalProgress, goalRange, goalStatus, goalTasks } from '../lib/goals';
import { fmtDate } from '../lib/projects';
import { todayISO } from '../lib/data';
import { firstName } from '../lib/format';
import { legProgress, plural, stopsOf, type Stop } from '../lib/legs';
import type { Goal, Member, Project, Task } from '../lib/types';
import { Avatar } from './Logo';

/** A goose in flight, drawn from the shared markup (static, no user content). */
function Goose({ delay = 0 }: { delay?: number }) {
  return <span className="gwrap" dangerouslySetInnerHTML={{ __html: gooseMarkup(delay) }} />;
}

const MINI = 'M0 5.2 C2 3.6 6 3.4 9 3.8 C10.4 3.9 11.4 2.6 12.6 2.1 C14 1.6 15.1 2.4 14.8 3.4 C14.5 4.1 13.6 4.3 12.8 4.6 C12 5.4 11.6 6.4 10.4 7 C8 8.2 3.4 8 0 5.2 Z';
const MINI_WING = 'M8.6 4.4 C8 2.4 6.4 0.6 3.6 -1.6 C4.6 0.8 5 2.8 5.4 4.6 Z';

/**
 * Goal progress as a small V of seven geese, flying right. Each goose is a seventh of the goal;
 * they join from the back of the V and the leader joins last, at 100%.
 */
export function VProg({ pg }: { pg: number }) {
  const n = 7, W = 92, H = 34;
  const on = pg >= 100 ? n : Math.floor(pg / 100 * n + 0.0001);
  const pos = Array.from({ length: n }, (_, i) => {
    const r = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
    return [W - 21 - r * 20, H / 2 - 5 + side * r * 5.4] as const;
  });
  return (
    <span className="vprog" title={`${on} of ${n} geese flying: ${pg}%`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {pos.map(([x, y], i) => (
          <g key={i} className={`mg ${i >= n - on ? '' : 'off'}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.25)`}>
            <path d={MINI} /><path d={MINI_WING} /><path className="bk" d="M14.8 3 L16.6 3.5 L14.7 4.1 Z" /></g>)).reverse()}
      </svg>
    </span>);
}

// The route is a curve from the nest (60,120) to the flag (940,112) on a 1000 × 190 map.
const P0 = [60, 120], P1 = [300, 40], P2 = [700, 40], P3 = [940, 112];
const at = (t: number) => { const u = 1 - t; return [0, 1].map(k => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k]); };
const part = (t: number) => {
  const L = (a: number[], b: number[]) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = L(P0, P1), b = L(P1, P2), c = L(P2, P3), d = L(a, b), e = L(b, c), f = L(d, e);
  return `M${P0} C${a} ${d} ${f}`;
};
const ROUTE = 'M60 120 C 300 40, 700 40, 940 112';

/**
 * One goal as a journey: a route from a nest (its start) to a flag (its end), the people on it
 * flying as a V at the goal's progress. The dashed line is where the calendar says the flock
 * should be. Whoever finished the most this week leads; people with overdue tasks trail.
 */
export function Journey({ g, goals, tasks, projects, people, solo, onEdit }: {
  g: Goal; goals: Goal[]; tasks: Task[]; projects: Project[]; people: Member[]; solo: boolean; onEdit?: (g: Goal) => void;
}) {
  const today = todayISO();
  const weekAgo = todayISO(new Date(Date.now() - 7 * 864e5));
  // An open-ended goal flies one leg per quarter; its flag is reaching last quarter's pace.
  const open = !g.end_date && g.status !== 'achieved';
  const lp = open ? legProgress(g, goals, tasks, projects, today) : null;
  const firstLeg = !!lp && lp.target == null;
  const st = goalStatus(g.status), ts = goalTasks(g, tasks);
  const pg = lp ? lp.pg : goalProgress(g, goals, tasks);
  const rows = people.map(x => ({
    x,
    done: ts.filter(t => t.assignee_member_id === x.id && t.status === 'done' && t.completed_at && t.completed_at >= weekAgo).length,
    late: ts.filter(t => t.assignee_member_id === x.id && t.status !== 'done' && t.due_date && t.due_date < today).length,
  }));
  const order = [...rows.filter(r => !r.late).sort((a, b) => b.done - a.done || a.x.display_name.localeCompare(b.x.display_name)),
    ...rows.filter(r => r.late).sort((a, b) => a.late - b.late)];
  const lead = order[0] && order[0].done && !order[0].late ? order[0] : null;
  const shown = solo ? order.slice(0, 1) : order.slice(0, 9);
  const D = (s: string) => new Date(`${s}T00:00:00`).getTime();
  let elapsed: number | null = null;
  if (lp) elapsed = firstLeg ? null : lp.elapsed;
  else if (g.end_date) elapsed = Math.max(0, Math.min(100, (Date.now() - D(g.start_date)) / (D(g.end_date) - D(g.start_date)) * 100));
  // on a first leg there is no pace to compare with yet: the flock flies with the calendar
  const tf = Math.max(0, Math.min(1, (firstLeg ? lp!.elapsed : pg) / 100)), [fx, fy] = at(tf);
  const arms = Math.min(4, Math.ceil((shown.length - 1) / 2));
  const behind = elapsed != null && pg < elapsed - 8, ahead = elapsed != null && pg > elapsed + 8;
  const late = order.filter(r => r.late);
  const verdict = lp ? (firstLeg
      ? <><b>First leg: setting the pace.</b> {plural(lp.done, 'task')} done this quarter; next quarter is measured against it.</>
      : pg >= 100 ? <><b>Last quarter's pace reached</b> ({plural(lp.done, 'task')} of {lp.target}). Anything more is extra.</>
      : behind ? <><b>Slower than last quarter</b> so far: {lp.done} of {plural(lp.target!, 'task')}, and the flock is short of the dashed line.</>
      : ahead ? <><b>Faster than last quarter</b> so far: {lp.done} of {plural(lp.target!, 'task')} already.</>
      : <><b>Same pace as last quarter:</b> {lp.done} of {plural(lp.target!, 'task')}.</>)
    : pg >= 100 ? <><b>Arrived.</b> The goal is reached.</>
    : behind ? <><b>Behind the calendar.</b> The flock is short of the dashed line, where it should be by now.</>
    : ahead ? <><b>Ahead of the calendar.</b> The flock has flown past the dashed line.</>
    : elapsed === 0 ? <><b>Not started yet</b> by the calendar.</>
    : <><b>On pace</b> with the calendar.</>;

  return (
    <article className="jlane">
      <div className="jhead">
        <h3>{onEdit ? <button onClick={() => onEdit(g)}>{g.title}</button> : g.title}</h3>
        <span className="pill" style={{ ['--c' as string]: st.color }}>{st.label}</span><span className="tag">{goalRange(g)}</span>
        <span className="grow" />{lp && <span className="tag">{lp.leg.label} leg</span>}<VProg pg={pg} /><span className="mono muted">{firstLeg ? '–' : `${pg}%`}</span></div>
      <div className="jmap">
        <svg className="land" viewBox="0 0 1000 190" preserveAspectRatio="none" aria-hidden="true">
          <path className="h1" d="M0 150 C 120 112, 230 128, 330 140 C 450 154, 560 104, 690 118 C 800 130, 880 100, 1000 112 L1000 190 L0 190 Z" />
          <path className="h2" d="M0 172 C 150 150, 260 164, 400 168 C 560 172, 650 146, 800 156 C 900 162, 950 150, 1000 154 L1000 190 L0 190 Z" />
          <path className="route" d={ROUTE} />
          {pg > 0 && <path className="flown" d={part(tf)} />}
        </svg>
        <div className="jpin jstart">
          <svg width="40" height="22" viewBox="0 0 40 22" aria-hidden="true"><ellipse cx="20" cy="15" rx="17" ry="6" fill="#B08452" />
            <path d="M5 13 C 12 18, 28 18, 35 13 M8 11 L32 17 M10 17 L30 11" stroke="#7A5530" strokeWidth="1.6" fill="none" />
            <ellipse cx="17" cy="11" rx="4" ry="3" fill="#fff" stroke="#1b1b1b" strokeWidth="1" /><ellipse cx="23" cy="11.5" rx="4" ry="3" fill="#fff" stroke="#1b1b1b" strokeWidth="1" /></svg>
          <span>{lp ? fmtDate(lp.leg.start, { day: 'numeric', month: 'short' }) : fmtDate(g.start_date, { month: 'short', year: 'numeric' })}</span></div>
        <div className="jpin jdest">
          <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M8 4 V42" stroke="var(--fg)" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M9 5 C 16 2, 22 9, 31 6 V 20 C 22 23, 16 16, 9 19 Z" fill={st.color} stroke="var(--fg)" strokeWidth="1.6" strokeLinejoin="round" />
            {pg >= 100 && <path d="M14 12 l4 4 l7 -8" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />}</svg>
          <span title={lp ? fmtDate(lp.leg.end, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}>{lp ? `End of ${lp.leg.short}` : fmtDate(g.end_date!, { month: 'short', year: 'numeric' })}</span></div>
        {elapsed != null && elapsed > 0 && elapsed < 100 && pg < 100 &&
          <div className="jtoday" style={{ left: `${at(elapsed / 100)[0] / 10}%` }}><span>{lp ? 'Last quarter\'s pace, today' : 'Today, by the calendar'}</span></div>}
        <div className="jflock" style={{ left: `max(${fx / 10}%, ${arms * 34 + 50}px)`, top: fy - 22 - (pg >= 100 ? 16 : 0) }}>
          {(shown.length ? shown : [null]).map((r, i) => {
            const k = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1), lag = r?.late ? 16 : 0;
            const tip = !r ? g.title : solo ? `${r.done ? `${r.done} task${r.done > 1 ? 's' : ''} done this week` : 'Nothing finished this week'}${r.late ? `, ${r.late} overdue` : ''}`
              : `${r.x.display_name}: ${r.done ? `${r.done} task${r.done > 1 ? 's' : ''} done this week` : 'nothing finished this week'}${r.late ? `, ${r.late} overdue` : ''}${r === lead ? ' · leading the flock' : ''}`;
            return (
              <div key={r?.x.id ?? 'g'} className={`bird ${r && r === lead && !solo ? 'lead' : ''} ${r?.late && !solo ? 'late' : ''}`} style={{ left: -(k * 34 + lag), top: side * k * 15 }} title={tip}>
                <div className="bob" style={{ animationDelay: `-${(i * 0.37 % 1.6).toFixed(2)}s` }}><Goose delay={-(i * 0.13 % 0.6)} /></div>
                {r && !solo && <Avatar m={r.x} />}</div>);
          })}
          {!solo && order.length > 9 && <span className="more" style={{ left: -(5 * 34 + 30), top: 0 }}>+{order.length - 9}</span>}
        </div>
      </div>
      <div className="jsay">
        <span>{verdict}</span>
        {!solo && (lead ? <span>{firstName(lead.x.display_name)} leads this week ({lead.done} done).</span> : order.length ? <span>No tasks finished this week yet.</span> : null)}
        {!solo && late.length > 0 && <span>Trailing: {late.map(r => `${firstName(r.x.display_name)} (${r.late} overdue)`).join(', ')}.</span>}
        {solo && late.length > 0 && <span>{late[0].late} overdue task{late[0].late > 1 ? 's' : ''} on this goal.</span>}
      </div>
      <Stops stops={stopsOf(g, goals, tasks, projects, today)} />
    </article>);
}

/**
 * The flight log: one column per quarter of the goal's life, as tall as the tasks finished in it,
 * with a small flag for every project completed. The current quarter has a dashed outline at
 * last quarter's height: the pace to match. The latest eight quarters show.
 */
export function Stops({ stops, compact = false }: { stops: Stop[]; compact?: boolean }) {
  if (!stops.length) return null;
  const shown = stops.slice(-8), older = stops.length - shown.length;
  const cur = shown.find(s => s.current), prev = cur ? shown[shown.indexOf(cur) - 1] : undefined;
  const max = Math.max(1, ...shown.map(s => s.tasks));
  const H = compact ? 34 : 56;
  const h = (n: number) => Math.round(n / max * H);
  const tip = (s: Stop) => `${s.leg.label}${s.current ? ' so far' : ''}: ${plural(s.tasks, 'task')} and ${plural(s.projects, 'project')} finished`;
  return (
    <div className={`flog ${compact ? 'compact' : ''}`} role="img" aria-label={`Finished per quarter: ${shown.map(tip).join('; ')}`}>
      <div className="flogh"><span className="stopslbl">{compact ? 'Per quarter' : 'Flight log'}</span>
        {older > 0 && <span className="muted">{older} earlier quarter{older > 1 ? 's' : ''} not shown</span>}
        <span className="grow" /><span className="flogkey"><i className="kb" />tasks done<FlagMini />project completed</span></div>
      <div className="flogcols" style={{ height: H + 34 }}>
        {shown.map(s => (
          <div key={s.leg.key} className={`fcol ${s.current ? 'now' : ''}`} title={tip(s)}>
            <span className="fflags">{s.projects > 0 && <>{Array.from({ length: Math.min(3, s.projects) }, (_, i) => <FlagMini key={i} />)}{s.projects > 3 && <small>+{s.projects - 3}</small>}</>}</span>
            <span className="fval">{s.tasks}</span>
            <span className="fbarwrap" style={{ height: H }}>
              {s.current && prev && prev.tasks > 0 && <span className="fghost" style={{ height: h(prev.tasks) }} />}
              <span className="fcbar" style={{ height: Math.max(s.tasks ? 3 : 0, h(s.tasks)) }} /></span>
            <span className="flbl">{s.leg.short}{s.current ? ' now' : ` ’${s.leg.key.slice(2, 4)}`}</span>
          </div>))}
      </div>
    </div>);
}

function FlagMini() {
  return <svg className="fflag" viewBox="0 0 10 12" aria-hidden="true"><path d="M1.5 11.5V1" /><path d="M2 1.2c2-.8 3.5 1 6 .2v4.4c-2.5.8-4-1-6-.2Z" /></svg>;
}
