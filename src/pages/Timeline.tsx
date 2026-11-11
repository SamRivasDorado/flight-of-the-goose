import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { getMySettings, listGoals, listMembers, listNoteDates, listProjectsFull, listTasks, saveMySettings, todayISO, useLoad } from '../lib/data';
import { canManage, type Goal, type ProjectFull, type Task } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { useLens } from '../lib/lens';
import { byDue, parseISO } from '../lib/format';
import { fmtDate } from '../lib/projects';
import { goalRange, goalStatus } from '../lib/goals';
import { Icon } from '../components/Logo';
import { NO_PROJECT_COLOR, ProjectIcon } from '../components/ProjectChip';
import { GoalDialog } from '../components/GoalDialog';
import { resolveStatuses } from '../lib/legs';
import { projectHref } from './Projects';
import { colorOf } from '../lib/goaltag';
import { GoalFlag, GoalIcon } from '../components/Geese';

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
    const noteDates = await listNoteDates(ws.workspace_id).catch(() => []);
    return { goals: resolveStatuses(goals, tasks, projects, noteDates), projects, tasks, members };
  }, [ws.workspace_id, ui.version]);
  const [zoom, setZoom] = useLocalPref<Zoom>('tlZoom', 'months');
  const [showDone, setShowDone] = useLocalPref('showDone', false);
  const [goalDlg, setGoalDlg] = useState<Goal | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // lanes each person has hidden (goals 'g:<id>', projects 'p:<id>', 'p:none'), kept with their settings so they follow them
  const [hidden, setHidden] = useState<string[]>([]);
  const [hidOpen, setHidOpen] = useState(false);
  // goals folded away (their projects hidden), kept the same way
  const [folded, setFolded] = useState<string[]>([]);
  const [group, setGroup] = useLocalPref('tlGroup', true);
  useEffect(() => { void getMySettings(ws.member_id).then(s => {
    setHidden(Array.isArray(s.tlHidden) ? s.tlHidden as string[] : []); setFolded(Array.isArray(s.tlFolded) ? s.tlFolded as string[] : []); }, () => undefined); }, [ws.member_id]);
  useEffect(() => {
    if (!hidOpen) return;
    const click = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.hidwrap')) setHidOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setHidOpen(false); };
    addEventListener('mousedown', click); addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', click); removeEventListener('keydown', key); };
  }, [hidOpen]);
  const setHid = (next: string[]) => { setHidden(next); void saveMySettings(ws.member_id, { tlHidden: next }).catch(() => undefined); };
  const toggleFold = (id: string) => { const next = folded.includes(id) ? folded.filter(x => x !== id) : [...folded, id]; setFolded(next); void saveMySettings(ws.member_id, { tlFolded: next }).catch(() => undefined); };
  const hideBtn = (k: string, name: string) => <button className="iconbtn lhide" title={`Hide “${name}” from the Timeline`} aria-label={`Hide ${name}`}
    onClick={() => setHid([...hidden, k])}><Icon name="eyeoff" /></button>;

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
  let hiddenNow: { k: string; name: string }[] = [];
  if (data) {
    const search = ui.q.trim().toLowerCase();
    const match = (t: Task) => (!search || t.title.toLowerCase().includes(search)) && lens.task(t);
    const away: { k: string; name: string }[] = [];   // lanes hidden by this person, for "n hidden"
    // project lanes: fixed term first, then ongoing, paused, closed
    const order = (p: ProjectFull) => p.status === 'closed' ? 3 : p.status === 'paused' ? 2 : p.kind === 'fixed' ? 0 : 1;
    const ps = data.projects.filter(p => !(p.status === 'closed' && p.end_date && p.end_date < startISO) && lens.project(p, data.tasks)).sort((a, b) => order(a) - order(b));
    /** A project's lane, or a lane of tasks without a project (loose, or `g`: linked only to that goal). */
    const lane = (p: ProjectFull | null, ts: Task[], g?: Goal) => {
      const color = p ? p.color : g ? colorOf(g, data.goals) : NO_PROJECT_COLOR;
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
            {p.status === 'paused' && <span className="cap" style={{ left: solid + 8 }}>paused</span>}</div>;
        }
      }
      const open = ts.filter(t => t.status !== 'done').length;
      const meta = `${p ? (p.kind === 'fixed' && p.start_date && p.end_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date, { day: 'numeric', month: 'short', year: '2-digit' })}` : p.status === 'active' ? 'Ongoing' : p.status === 'paused' ? 'Paused' : 'Closed') + ' · ' : ''}${open} open${undated ? ` · ${undated} undated` : ''}`;
      const k = p ? `p:${p.id}` : g ? `go:${g.id}` : 'p:none';
      const name = p ? p.name : g ? `${g.title}: tasks without a project` : 'Tasks without project or goal';
      if (hidden.includes(k)) { away.push({ k, name }); return []; }
      return [
        <div key={`n${k}`} className={`lname ${p ? '' : 'lnotp'}`} style={{ height: h }}>
          <a href={p ? projectHref(p.id) : g ? '#/strategy' : '#/tasks'}>
            {p ? <ProjectIcon p={p} /> : <span className="picon" style={{ ['--c' as string]: color }}><Icon name={g ? 'target' : 'tasks'} /></span>}
            <span>{p ? p.name : g ? 'Without a project' : group ? 'Loose tasks' : 'No project'}</span></a>
          <span className="lm">{meta}</span>{hideBtn(k, name)}</div>,
        <div key={`t${k}`} className="track" style={{ height: h, width: W }}>{shading}{band}
          {marks.map(({ t, l, lw, row }) => {
            const done = t.status === 'done';
            return <button key={t.id} className={`mk ${done ? 'done' : ''} ${!done && t.due_date! < today ? 'late' : ''}`} style={{ ['--c' as string]: color, left: l, top: 12 + row * 24, maxWidth: lw }}
              onClick={() => ui.openTask(t.id)} title={`${t.title} · ${fmtDate(t.due_date!, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${done ? ' · done' : ''}`}>
              <span className="dotm" />{zoom !== 'quarters' && <span className="lt">{t.title || 'Untitled task'}</span>}</button>;
          })}</div>];
    };
    const tasksOf = (p: ProjectFull) => data.tasks.filter(t => t.project_id === p.id && match(t));
    const loose = data.tasks.filter(t => !data.projects.some(p => p.id === t.project_id) && match(t));
    const looseShown = !lens.filt.project || lens.filt.project === 'none';
    if (group && !lens.filt.project) {
      // Grouped by goal: a thin stripe per goal, its projects and its own tasks underneath; then projects
      // without a goal; loose tasks at the bottom. A project with several goals shows under the first.
      const tops = data.goals.filter(g => !g.parent_id);
      const topOf = (id: string | null) => { const g = data.goals.find(x => x.id === id); const t = g?.parent_id ? data.goals.find(x => x.id === g.parent_id) : g; return t && !t.parent_id ? t.id : null; };
      const under = new Map<string, ProjectFull[]>(), own = new Map<string, Task[]>(), noGoal: ProjectFull[] = [], free: Task[] = [];
      for (const p of ps) { const gid = p.goal_ids.map(topOf).find(Boolean); if (gid) under.set(gid, [...(under.get(gid) ?? []), p]); else noGoal.push(p); }
      for (const t of loose) { const gid = topOf(t.goal_id); if (gid) own.set(gid, [...(own.get(gid) ?? []), t]); else free.push(t); }
      const filtering = !!search || Object.values(lens.filt).some(Boolean);
      let stripes = 0;
      for (const g of tops) {
        const gp = under.get(g.id) ?? [], gt = own.get(g.id) ?? [];
        const inView = (g.end_date ?? endISO) >= startISO && g.start_date <= endISO;
        if (!gp.length && !gt.length && (filtering || !inView)) continue;
        const k = `g:${g.id}`;
        if (hidden.includes(k)) { away.push({ k, name: g.title }); continue; }
        stripes++;
        const shut = folded.includes(g.id), st = goalStatus(g.status), col = colorOf(g, data.goals);
        const openTasks = gp.reduce((n, p) => n + tasksOf(p).filter(t => t.status !== 'done').length, 0) + gt.filter(t => t.status !== 'done').length;
        const what = [gp.length ? `${gp.length} project${gp.length === 1 ? '' : 's'}` : '', openTasks ? `${openTasks} open task${openTasks === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
        const endIn = g.end_date && g.end_date >= startISO && g.end_date <= endISO;
        lanes.push(
          <div key={`n${k}`} className="lname gstripe" style={{ height: 36 }}>
            <button className="iconbtn gfold" aria-expanded={!shut} aria-label={shut ? `Unfold ${g.title}` : `Fold ${g.title}`} title={shut ? 'Show its projects' : 'Fold its projects away'}
              onClick={() => toggleFold(g.id)}><Icon name={shut ? 'right' : 'down'} /></button>
            <a href="#/strategy"><GoalIcon g={g} goals={data.goals} /><span>{g.title}</span></a>{hideBtn(k, g.title)}</div>,
          <div key={`t${k}`} className="track gstripe" style={{ height: 36, width: W, ['--c' as string]: col }}>{shading}
            <button className="gsum" style={{ left: Math.max(8, Math.min(x(today) - 150, W - 560)) }} title={`${g.title} · ${goalRange(g)}`}
              onClick={() => (canManage(ws.access) ? setGoalDlg(g) : (location.hash = '#/strategy'))}>
              {!shut && <b>{g.title}</b>}<span className="gdot" style={{ ['--c' as string]: st.color }} />{st.label} · {g.end_date ? `ends ${fmtDate(g.end_date)}` : 'no end date'}
              {shut && what ? <span className="muted"> · {what} folded</span> : null}</button>
            {endIn && <span className="gend" style={{ left: x(g.end_date!) + ppd / 2 - 5 }} title={`${g.title} ends ${fmtDate(g.end_date!)}`}><GoalFlag color={col} reached={g.status === 'achieved'} small /></span>}
          </div>);
        if (shut) continue;
        gp.forEach(p => lanes.push(...lane(p, tasksOf(p))));
        if (gt.length) lanes.push(...lane(null, gt, g));
      }
      const section = (key: string, label: string) => lanes.push(<div key={`sn${key}`} className="lname lsec">{label}</div>, <div key={`st${key}`} className="track lsec" style={{ width: W }}>{shading}</div>);
      if (noGoal.length) { if (stripes) section('ng', 'Projects without a goal'); noGoal.forEach(p => lanes.push(...lane(p, tasksOf(p)))); }
      if (free.length && looseShown) { if (stripes) section('free', 'Tasks without project or goal'); lanes.push(...lane(null, free)); }
    } else {
      ps.forEach(p => lanes.push(...lane(p, tasksOf(p))));
      if (loose.length && looseShown) lanes.push(...lane(null, loose));
    }
    hiddenNow = away;
  }

  return (
    <>
      <div className="ph"><h1>Timeline</h1><span className="sub">Every goal and project as a lane. Solid bands have an end date; hatched bands run on with no end date.</span><span className="grow" />
        <span className="seg" role="group" aria-label="Zoom">{(Object.keys(ZOOM) as Zoom[]).map(k =>
          <button key={k} className={zoom === k ? 'on' : ''} onClick={() => setZoom(k)}>{ZOOM[k].label}</button>)}</span>
        <button className="btn sm" onClick={toToday}>Today</button>
        {hiddenNow.length > 0 && <span className="hidwrap">
          <button className="btn sm ghost" aria-expanded={hidOpen} onClick={() => setHidOpen(o => !o)}><Icon name="eyeoff" />{hiddenNow.length} hidden</button>
          {hidOpen && <div className="hidpop" role="dialog" aria-label="Hidden lanes">
            {hiddenNow.map(h => <div key={h.k} className="hidrow"><span>{h.name}</span>
              <button className="btn sm ghost" onClick={() => setHid(hidden.filter(x => x !== h.k))}><Icon name="eye" />Show</button></div>)}
            <div className="hidrow"><span className="grow" /><button className="btn sm" onClick={() => { setHid(hidden.filter(x => !hiddenNow.some(h => h.k === x))); setHidOpen(false); }}>Show all</button></div>
          </div>}</span>}
        <label className="chk" title="Show projects under their goals"><input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} />Group by goal</label>
        <label className="chk"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label></div>
      {error && <div className="err">{error}</div>}
      <div className="tl-scroll" ref={scroller}>
        <div className="tl" style={{ gridTemplateColumns: `200px ${W}px`, ['--wkpx' as string]: q ? '100000px' : `${7 * ppd}px` }}>
          <div className="corner"><span>Goals and projects</span></div>
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
