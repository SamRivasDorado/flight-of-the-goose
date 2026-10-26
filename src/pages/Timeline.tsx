import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { listGoals, listMembers, listProjectsFull, listTasks, todayISO, useLoad } from '../lib/data';
import { canManage, type Goal, type ProjectFull, type Task } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { useLens } from '../lib/lens';
import { byDue, parseISO } from '../lib/format';
import { fmtDate } from '../lib/projects';
import { goalProgress, goalRange, goalStatus } from '../lib/goals';
import { legProgress } from '../lib/legs';
import { Icon } from '../components/Logo';
import { NO_PROJECT_COLOR, ProjectIcon } from '../components/ProjectChip';
import { GoalDialog } from '../components/GoalDialog';
import { projectHref } from './Projects';

type Zoom = 'weeks' | 'months' | 'quarters';
/** Pixels per day, and how many days to show before and after today (as in the prototype). */
const ZOOM: Record<Zoom, { ppd: number; back: number; fwd: number; label: string }> = {
  weeks: { ppd: 30, back: 21, fwd: 100, label: 'Weeks' },
  months: { ppd: 7, back: 56, fwd: 330, label: 'Months' },
  quarters: { ppd: 2.2, back: 120, fwd: 640, label: 'Quarters' },
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));

export function Timeline() {
  const ws = useWorkspace();
  const ui = useUI();
  const lens = useLens();
  const { data, error, reload } = useLoad(async () => {
    const [goals, projects, tasks, members] = await Promise.all([listGoals(ws.workspace_id), listProjectsFull(ws.workspace_id), listTasks(ws.workspace_id), listMembers(ws.workspace_id)]);
    return { goals, projects, tasks, members };
  }, [ws.workspace_id, ui.version]);
  const [zoom, setZoom] = useLocalPref<Zoom>('tlZoom', 'months');
  const [showDone, setShowDone] = useLocalPref('showDone', false);
  const [goalDlg, setGoalDlg] = useState<Goal | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const z = ZOOM[zoom], ppd = z.ppd;
  const start = monday(addDays(new Date(), -z.back)), end = addDays(start, z.back + z.fwd);
  const W = Math.round(Math.round((end.getTime() - start.getTime()) / 864e5) * ppd);
  const x = (s: string) => (parseISO(s).getTime() - start.getTime()) / 864e5 * ppd;
  const startISO = todayISO(start), endISO = todayISO(end), today = todayISO();

  const toToday = () => { if (scroller.current) scroller.current.scrollLeft = Math.max(0, x(today) - 160); };
  // open at today, and again whenever the zoom changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(toToday, [zoom, !!data]);

  // header: months (or quarters), and Monday/Friday ticks
  const head: ReactNode[] = [], shading: ReactNode[] = [];
  const q = zoom === 'quarters';
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const px = x(todayISO(d)); if (px < -40) continue;
    if (!q || d.getMonth() % 3 === 0) head.push(<span key={`m${px}`} className="mlab" style={{ left: Math.max(0, px), height: q ? 38 : 20 }}>
      {d.toLocaleDateString('en-GB', q ? { month: 'short', year: 'numeric' } : { month: 'long', ...(d.getMonth() === 0 || px < 5 ? { year: 'numeric' } : {}) })}{q ? ` · Q${d.getMonth() / 3 + 1}` : ''}</span>);
    if (q) head.push(<span key={`q${px}`} className="wlab" style={{ left: px }}>{d.toLocaleDateString('en-GB', { month: 'short' })}</span>);
  }
  if (!q) for (let d = new Date(start); d < end; d = addDays(d, 7)) {
    const fri = addDays(d, 4), wk = zoom === 'weeks';
    head.push(<span key={`w${d.getTime()}`} className="wlab mon" style={{ left: x(todayISO(d)) }}>{wk ? 'Mon ' : ''}{d.getDate()}</span>,
      <span key={`f${d.getTime()}`} className="wlab fri" style={{ left: x(todayISO(fri)) }}>{wk ? 'Fri ' : ''}{fri.getDate()}</span>);
    if (wk) shading.push(<i key={`s${d.getTime()}`} className="wkend" style={{ left: x(todayISO(addDays(d, 5))), width: 2 * ppd }} />);
  }

  const lanes: ReactNode[] = [];
  if (data) {
    const search = ui.q.trim().toLowerCase();
    const match = (t: Task) => (!search || t.title.toLowerCase().includes(search)) && lens.task(t);
    // goals lane
    const goals = data.goals.filter(g => !g.parent_id).map(g => ({ g, r: [g.start_date, g.end_date ?? endISO] as const })).filter(o => o.r[1] >= startISO && o.r[0] <= endISO);
    if (goals.length && !lens.filt.project) {
      const rows: number[] = [];
      const items = goals.map(({ g, r }) => {
        const l = Math.max(0, x(r[0])), w = Math.min(W, x(r[1]) + ppd) - l;
        let row = rows.findIndex(e => e <= l); if (row < 0) { row = rows.length; rows.push(0); } rows[row] = l + w + 4;
        return { g, l, w, row };
      });
      const h = 12 + rows.length * 28;
      lanes.push(
        <div key="gl" className="lname" style={{ height: h }}><a href="#/strategy"><span className="picon" style={{ ['--c' as string]: 'var(--sun)' }}><Icon name="target" /></span><span>Goals</span></a>
          <span className="lm">{goals.length} in view</span></div>,
        <div key="gt" className="track" style={{ height: h, width: W }}>{shading}{items.map(({ g, l, w, row }) => {
          const st = goalStatus(g.status);
          // open-ended goals are measured per quarter (legs), so their bar is not filled
          const lp = !g.end_date && g.status !== 'achieved' ? legProgress(g, data.goals, data.tasks, data.projects) : null;
          const pg = lp ? lp.pg : goalProgress(g, data.goals, data.tasks);
          const txt = lp ? (lp.target == null ? `${lp.leg.short} first leg` : `${lp.leg.short} leg ${pg}%`) : `${pg}%`;
          return <button key={g.id} className={`gbar ${g.end_date ? '' : 'open'}`} style={{ ['--c' as string]: st.color, left: l, width: w, top: 8 + row * 28 }}
            title={`${g.title} · ${goalRange(g)} · ${txt}`} onClick={() => canManage(ws.access) ? setGoalDlg(g) : (location.hash = '#/strategy')}>
            {!lp && <i style={{ width: `${pg}%` }} />}<span style={{ paddingLeft: Math.max(8, x(today) - 150 - l) }}>{g.title} · {txt}</span></button>;
        })}</div>);
    }
    // project lanes: fixed term first, then ongoing, paused, closed
    const order = (p: ProjectFull) => p.status === 'closed' ? 3 : p.status === 'paused' ? 2 : p.kind === 'fixed' ? 0 : 1;
    const ps = data.projects.filter(p => !(p.status === 'closed' && p.end_date && p.end_date < startISO) && lens.project(p, data.tasks)).sort((a, b) => order(a) - order(b));
    const lane = (p: ProjectFull | null, ts: Task[]) => {
      const color = p ? p.color : NO_PROJECT_COLOR;
      const dated = ts.filter(t => t.due_date && t.due_date >= startISO && t.due_date <= endISO && (showDone || t.status !== 'done')).sort(byDue);
      const undated = ts.filter(t => !t.due_date && t.status !== 'done').length;
      const rows: number[] = [];
      const marks = dated.map(t => {
        const l = x(t.due_date!) + ppd / 2 - 6;
        const lw = zoom === 'weeks' ? Math.min(170, 7 * t.title.length + 26) : zoom === 'months' ? Math.min(150, 6.6 * t.title.length + 24) : 14;
        let row = rows.findIndex(e => e <= l); if (row < 0) { row = rows.length; rows.push(0); } rows[row] = l + lw + 6;
        return { t, l, lw, row };
      });
      const h = Math.max(54, 14 + Math.max(1, rows.length) * 24 + 8);
      let band: ReactNode = null;
      if (p) {
        const s = p.start_date && p.start_date > startISO ? x(p.start_date) : 0;
        if (p.kind === 'fixed' && p.end_date) {
          const e = Math.min(W, x(p.end_date) + ppd);
          if (e > s) band = <div className={`band fixed ${p.status === 'closed' ? 'closed' : ''}`} style={{ ['--c' as string]: p.color, left: s, width: e - s }}>
            {p.end_date <= endISO && <span className="cap" style={{ right: 4 }}>ends {fmtDate(p.end_date)}</span>}</div>;
        } else {
          const solid = Math.max(0, Math.min(W, x(today)) - s);
          band = <div className={`band open ${p.status !== 'active' ? 'closed' : ''}`} style={{ ['--c' as string]: p.color, left: s, width: W - s, ['--solid' as string]: `${solid}px` }}>
            <span className="cap" style={{ left: solid + 8 }}>{p.status === 'paused' ? 'paused' : 'ongoing, no end date'}</span></div>;
        }
      }
      const open = ts.filter(t => t.status !== 'done').length;
      const meta = `${p ? (p.kind === 'fixed' && p.start_date && p.end_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date, { day: 'numeric', month: 'short', year: '2-digit' })}` : p.status === 'active' ? 'Ongoing' : p.status === 'paused' ? 'Paused' : 'Closed') + ' · ' : ''}${open} open${undated ? ` · ${undated} undated` : ''}`;
      const k = p ? p.id : 'none';
      return [
        <div key={`n${k}`} className="lname" style={{ height: h }}>
          <a href={p ? projectHref(p.id) : '#/tasks'}>
            {p ? <ProjectIcon p={p} /> : <span className="picon" style={{ ['--c' as string]: NO_PROJECT_COLOR }}><Icon name="folder" /></span>}<span>{p ? p.name : 'No project'}</span></a>
          <span className="lm">{meta}</span></div>,
        <div key={`t${k}`} className="track" style={{ height: h, width: W }}>{shading}{band}
          {marks.map(({ t, l, lw, row }) => {
            const done = t.status === 'done';
            return <button key={t.id} className={`mk ${done ? 'done' : ''} ${!done && t.due_date! < today ? 'late' : ''}`} style={{ ['--c' as string]: color, left: l, top: 12 + row * 24, maxWidth: lw }}
              onClick={() => ui.openTask(t.id)} title={`${t.title} · ${fmtDate(t.due_date!, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${done ? ' · done' : ''}`}>
              <span className="dotm" />{zoom !== 'quarters' && <span className="lt">{t.title || 'Untitled task'}</span>}</button>;
          })}</div>];
    };
    ps.forEach(p => lanes.push(...lane(p, data.tasks.filter(t => t.project_id === p.id && match(t)))));
    const loose = data.tasks.filter(t => !data.projects.some(p => p.id === t.project_id) && match(t));
    if (loose.length && (!lens.filt.project || lens.filt.project === 'none')) lanes.push(...lane(null, loose));
  }

  return (
    <>
      <div className="ph"><h1>Timeline</h1><span className="sub">Every project as a lane. Solid bands are fixed-term projects; hatched bands run on with no end date.</span><span className="grow" />
        <span className="seg" role="group" aria-label="Zoom">{(Object.keys(ZOOM) as Zoom[]).map(k =>
          <button key={k} className={zoom === k ? 'on' : ''} onClick={() => setZoom(k)}>{ZOOM[k].label}</button>)}</span>
        <button className="btn sm" onClick={toToday}>Today</button>
        <label className="chk"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label></div>
      {error && <div className="err">{error}</div>}
      <div className="tl-scroll" ref={scroller}>
        <div className="tl" style={{ gridTemplateColumns: `200px ${W}px`, ['--wkpx' as string]: q ? '100000px' : `${7 * ppd}px` }}>
          <div className="corner"><span>Project{!q && <small>dates: Mondays and Fridays</small>}</span></div>
          <div className="thead" style={{ width: W }}>{head}</div>
          {data && lanes.length === 0 && <><div className="lname">Nothing here yet</div>
            <div className="track" style={{ width: W, height: 60 }}><span className="hint" style={{ position: 'absolute', left: Math.max(12, x(today) - 140), top: 20 }}>
              Create a project or a task with a due date and it appears here.</span></div></>}
          {lanes}
          <i className="tl-today" style={{ left: 200 + x(today) + ppd / 2 }} />
        </div>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><i className="sw" style={{ background: 'color-mix(in srgb,var(--sage) 25%,var(--surface))', borderLeft: '2px solid var(--sage)', borderRight: '2px solid var(--sage)' }} />Fixed-term project</span>
        <span><i className="sw" style={{ background: 'repeating-linear-gradient(135deg,color-mix(in srgb,var(--sage) 22%,var(--surface)) 0 4px,var(--surface) 4px 8px)' }} />Ongoing, no end date</span>
        <span><i className="dot" style={{ ['--c' as string]: 'var(--surface)', border: '2.5px solid var(--sage)', width: 11, height: 11 }} /> Open task</span>
        <span><i className="dot" style={{ ['--c' as string]: 'var(--sage)', opacity: .5, width: 11, height: 11 }} /> Done</span>
        <span><i className="dot" style={{ ['--c' as string]: 'var(--surface)', border: '2.5px solid var(--danger)', width: 11, height: 11 }} /> Overdue</span>
      </div>
      {goalDlg && <GoalDialog goal={goalDlg} goals={data?.goals ?? []} members={data?.members ?? []} projects={data?.projects ?? []}
        onClose={() => setGoalDlg(null)} onSaved={() => { setGoalDlg(null); ui.changed(); void reload(); }} />}
    </>
  );
}
