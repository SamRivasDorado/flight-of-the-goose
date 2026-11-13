import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { listGoals, listNoteDates, listProjectsFull, listTasks, todayISO, updateTask, useLoad } from '../lib/data';
import { canEdit, type ProjectFull, type Task } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { useLens } from '../lib/lens';
import { byDue, dueLabel, hrs, parseISO } from '../lib/format';
import { fmtDate, health, lastActivity } from '../lib/projects';
import { goalProgress, goalStatus, goalTasks } from '../lib/goals';
import { colorOf } from '../lib/goaltag';
import { writeSummary } from '../lib/reviewSummary';
import { Icon } from '../components/Logo';
import { resolveStatuses } from '../lib/legs';
import { PeriodPicker } from '../components/PeriodPicker';
import { periodName, range as periodRange, taskDay, type Period } from '../lib/period';
import { NO_PROJECT_COLOR, ProjectChip } from '../components/ProjectChip';
import { projectHref } from './Projects';

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const iso = (d: Date) => todayISO(d);
const spanDays = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5) + 1;

/** Periods saved before Review and Insights shared one control, in the new form. */
const OLD: Record<string, Period['kind']> = { this_week: 'thisWeek', last_week: 'lastWeek', last_7: 'last7', this_month: 'thisMonth', last_month: 'lastMonth',
  last_30: 'last30', this_q: 'thisQuarter', last_q: 'lastQuarter', this_year: 'thisYear', last_year: 'lastYear' };
function fmtRange(a: string, b: string) {
  const A = parseISO(a), B = parseISO(b), sy = A.getFullYear() === B.getFullYear();
  return `${A.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sy ? {} : { year: 'numeric' }) })} – ${B.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

interface RV { period?: Period; preset?: string; from?: string; to?: string; months?: number; week?: boolean; inc: boolean | null; dims?: string[]; sumMode?: 'written' | 'list'; allDone?: boolean }

export function Review() {
  const ws = useWorkspace();
  const ui = useUI();
  const lens = useLens();
  const self = ws.access === 'member' || ws.access === 'guest';
  const { data, error, reload } = useLoad(async () => {
    const [tasks, projects, goals, noteDates] = await Promise.all([listTasks(ws.workspace_id), listProjectsFull(ws.workspace_id), listGoals(ws.workspace_id), listNoteDates(ws.workspace_id)]);
    return { tasks, projects, goals: resolveStatuses(goals, tasks, projects, noteDates), noteDates };
  }, [ws.workspace_id, ui.version]);
  const [rv, setRv] = useLocalPref<RV>('review', { period: { kind: 'thisWeek' }, inc: null });
  const [msg, setMsg] = useState<string | null>(null);

  const period: Period = rv.period ?? (rv.preset === 'custom' && rv.from && rv.to ? { kind: 'custom', from: rv.from, to: rv.to, months: rv.months, week: rv.week }
    : { kind: OLD[rv.preset ?? ''] ?? 'thisWeek' });
  const days = (data?.tasks ?? []).map(taskDay).filter(Boolean).sort();
  const { from: a, to: b } = periodRange(period, days[0], days[days.length - 1]);
  const today = todayISO();
  const presetName = periodName(period);
  const setPeriod = (p: Period) => setRv({ period: p, inc: null, dims: rv.dims, sumMode: rv.sumMode });
  async function act(t: Task, patch: Partial<Task>, note: string) {
    try { await updateTask(t.id, patch); setMsg(note); ui.changed(); void reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }

  if (error) return <div className="err">{error}</div>;
  if (!data) return <span className="muted">Loading…</span>;

  const q = ui.q.trim().toLowerCase();
  // members (and guests) review only the tasks assigned to them
  const tasks = data.tasks.filter(t => (!q || t.title.toLowerCase().includes(q)) && lens.task(t, self ? ws.member_id : null));
  const proj = (id: string | null) => data.projects.find(p => p.id === id);
  const inR = (s: string | null | undefined) => !!s && s >= a && s <= b;
  const isDone = (t: Task) => t.status === 'done';
  const done = tasks.filter(t => isDone(t) && inR(t.completed_at)).sort((x, y) => (x.completed_at! < y.completed_at! ? -1 : 1));
  const hoursDone = done.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const cutoff = b < today ? b : iso(addDays(parseISO(today), -1));
  const slipped = tasks.filter(t => !isDone(t) && t.due_date && t.due_date <= cutoff).sort(byDue);
  const upStart = b >= today ? iso(addDays(parseISO(b), 1)) : today;
  const upLen = Math.max(7, Math.min(31, spanDays(a, b)));
  const upEnd = iso(addDays(parseISO(upStart), upLen - 1));
  const upcoming = tasks.filter(t => !isDone(t) && t.due_date && t.due_date >= upStart && t.due_date <= upEnd).sort(byDue);
  const touchesNow = b >= iso(addDays(parseISO(today), -1));
  const incUp = rv.inc ?? touchesNow;
  const notesR = data.noteDates.filter(n => inR(n.entry_date));
  const active = data.projects.filter(p => p.status === 'active' && lens.project(p, data.tasks));
  const quiet = active.filter(p => !data.tasks.some(t => t.project_id === p.id && (inR(t.completed_at) || inR(t.created_at.slice(0, 10)))) && !data.noteDates.some(n => n.project_id === p.id && inR(n.entry_date)));

  type Row = { label: string; color: string; h: number; n: number };
  const byProj = new Map<string, Row>();
  done.forEach(t => { const p = proj(t.project_id), k = p ? p.id : '_';
    if (!byProj.has(k)) byProj.set(k, { label: p ? p.name : 'No project', color: p ? p.color : NO_PROJECT_COLOR, h: 0, n: 0 });
    const o = byProj.get(k)!; o.h += Number(t.hours) || 0; o.n++; });
  const projRows = [...byProj.values()].sort((x, y) => y.h - x.h || y.n - x.n);
  const topOf = (id: string) => { const g = data.goals.find(x => x.id === id); return g ? (g.parent_id ?? g.id) : null; };
  const taskTopGoals = (t: Task) => { const out = new Set<string>(); if (t.goal_id) { const k = topOf(t.goal_id); if (k) out.add(k); }
    if (t.project_id) data.goals.forEach(g => { if (g.project_ids.includes(t.project_id!)) out.add(g.parent_id ?? g.id); }); return [...out]; };
  const byGoal = new Map<string, Row>();
  done.forEach(t => { const gs = taskTopGoals(t); (gs.length ? gs : ['_']).forEach(k => { const g = data.goals.find(x => x.id === k);
    if (!byGoal.has(k)) byGoal.set(k, { label: g ? g.title : 'Not linked to a goal', color: g ? goalStatus(g.status).color : NO_PROJECT_COLOR, h: 0, n: 0 });
    const o = byGoal.get(k)!; o.h += Number(t.hours) || 0; o.n++; }); });
  const goalRows = [...byGoal.entries()].sort((x, y) => Number(x[0] === '_') - Number(y[0] === '_') || y[1].h - x[1].h || y[1].n - x[1].n).map(e => e[1]);
  const bdDims = (rv.dims ?? []).map(id => lens.dims.find(d => d.id === id)).filter(Boolean) as typeof lens.dims;
  const byDim = new Map<string, Row>();
  if (bdDims.length) done.forEach(t => {
    const parts = bdDims.map(d => d.options.find(o => o.id === lens.eff(t, d.id).option));
    const k = parts.map(o => o?.id ?? '_').join('|');
    if (!byDim.has(k)) byDim.set(k, { label: parts.map(o => o?.label ?? 'Not set').join(' · '), color: parts.find(Boolean)?.color ?? NO_PROJECT_COLOR, h: 0, n: 0 });
    const o = byDim.get(k)!; o.h += Number(t.hours) || 0; o.n++; });
  const dimRows = [...byDim.values()].sort((x, y) => y.h - x.h || y.n - x.n);
  const useH = hoursDone > 0, metric = (r: Row) => (useH ? r.h : r.n);
  const bars = (rows: Row[], total?: number) => { const max = Math.max(1e-9, ...rows.map(metric)); return rows.map((r, i) => (
    <div key={i} className="hbar"><span title={r.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
      <span className="b"><i style={{ width: `${metric(r) / max * 100}%`, ['--c' as string]: r.color }} /></span>
      <span className="mono">{useH ? `${hrs(r.h)} h` : `${r.n} task${r.n > 1 ? 's' : ''}`}{total ? ` · ${Math.round(metric(r) / total * 100)}%` : ''}</span></div>)); };

  const range = fmtRange(a, b);
  const pn = (t: Task) => proj(t.project_id) ? ` (${proj(t.project_id)!.name})` : '';
  const line = (r: Row) => `- ${r.label}: ${r.n} task${r.n > 1 ? 's' : ''}${r.h ? `, ${hrs(r.h)} h` : ''}`;
  const summary = [`${presetName}: ${range}`, `${done.length} task${done.length === 1 ? '' : 's'} completed, ${hrs(hoursDone)} h logged.`,
    ...(goalRows.length ? ['', 'By goal:', ...goalRows.map(line)] : []),
    ...(projRows.length ? ['', 'By project:', ...projRows.map(line)] : []),
    ...(dimRows.length ? ['', `By ${bdDims.map(d => d.name.toLowerCase()).join(' × ')}:`, ...dimRows.map(line)] : []),
    ...(done.length ? ['', 'Completed:', ...done.map(t => `- ${t.title}${pn(t)}`)] : []),
    ...(slipped.length ? ['', `Open and overdue (${slipped.length}):`, ...slipped.map(t => `- ${t.title}${pn(t)}, due ${fmtDate(t.due_date!, { day: 'numeric', month: 'short', year: 'numeric' })}`)] : []),
    ...(incUp && upcoming.length ? ['', `Coming up, ${fmtRange(upStart, upEnd)}:`, ...upcoming.map(t => `- ${t.title}${pn(t)}, ${fmtDate(t.due_date!, { weekday: 'short', day: 'numeric', month: 'short' })}`)] : [])].join('\n');

  // ---- goals and projects: progress at the end of the period, what it gained in the period, and time spent
  // progress = share of the tasks (that existed on that day) done by that day; the same rule for goals and projects
  const doneBy = (t: Task, d: string) => t.status === 'done' && !!t.completed_at && t.completed_at.slice(0, 10) <= d;
  const shareAt = (ts: Task[], d: string) => { const ex = ts.filter(t => t.created_at.slice(0, 10) <= d); return ex.length ? Math.round(ex.filter(t => doneBy(t, d)).length / ex.length * 100) : null; };
  const endDay = b < today ? b : today, dayBefore = iso(addDays(parseISO(a), -1));
  const prog = (ts: Task[], fallback: number) => { const e = shareAt(ts, endDay), st = shareAt(ts, dayBefore);
    return e == null ? { end: fallback, gain: 0 } : { end: e, gain: st == null ? e : e - st }; };
  type GP = { key: string; name: string; href: string; color: string; dot: string; status: string; end: number; gain: number; h: number; n: number; sub: boolean };
  const tops = data.goals.filter(g => !g.parent_id);
  const firstTop = (p: ProjectFull) => p.goal_ids.map(topOf).find(id => !!id && tops.some(t => t.id === id)) ?? null;
  const listed = data.projects.filter(p => (p.status === 'active' && lens.project(p, data.tasks)) || byProj.has(p.id));
  const pRow = (p: ProjectFull): GP => { const hl = health(p, data.tasks, data.noteDates), t = byProj.get(p.id);
    return { key: p.id, name: p.name, href: projectHref(p.id), color: p.color, dot: hl.color, status: hl.label, ...prog(data.tasks.filter(x => x.project_id === p.id), 0), h: t?.h ?? 0, n: t?.n ?? 0, sub: true }; };
  const byTime = (x: GP, y: GP) => y.h - x.h || y.n - x.n || x.name.localeCompare(y.name);
  const gpRows: GP[] = [];
  for (const g of tops) {
    const ps = listed.filter(p => firstTop(p) === g.id).map(pRow).sort(byTime), t = byGoal.get(g.id), st = goalStatus(g.status);
    if (g.status === 'achieved' && !t && !ps.length) continue;
    const pr = g.status === 'achieved' ? { end: 100, gain: 0 } : prog(goalTasks(g, data.tasks), goalProgress(g, data.goals, data.tasks));
    gpRows.push({ key: g.id, name: g.title, href: '#/strategy', color: colorOf(g, data.goals), dot: st.color, status: st.label, ...pr, h: t?.h ?? 0, n: t?.n ?? 0, sub: false }, ...ps);
  }
  const noGoal = listed.filter(p => !firstTop(p)).map(pRow).sort(byTime);
  const loose = byProj.get('_');

  const editable = canEdit(ws.access);
  const [showAllDone, setShowAllDone] = [rv.allDone ?? false, (v: boolean) => setRv({ ...rv, allDone: v })];
  const rrow = (t: Task, acts?: ReactNode) => { const d = dueLabel(t.due_date, isDone(t)); const p = proj(t.project_id); return (
    <div key={t.id} className="rrow"><button className="t" onClick={() => ui.openTask(t.id)}>{t.title || 'Untitled task'}</button>
      {p && <ProjectChip p={p} />}<span className={`mono ${d.cls}`} style={{ fontSize: 12 }}>{d.text}</span>{acts && <span className="acts">{acts}</span>}</div>); };
  const nextMon = iso(addDays(monday(new Date()), 7));
  const slipActs = (t: Task) => editable && <>
    <button className="btn sm" onClick={() => void act(t, { status: 'done' }, `Marked “${t.title}” complete`)}><Icon name="check" />Done</button>
    <button className="btn sm" onClick={() => void act(t, { due_date: nextMon }, `Moved “${t.title}” to ${fmtDate(nextMon, { weekday: 'short', day: 'numeric', month: 'short' })}`)}>Next Monday</button>
    <button className="btn sm" onClick={() => { const d = iso(addDays(parseISO(t.due_date ?? today), 7)); void act(t, { due_date: d }, `Moved “${t.title}” to ${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}`); }}>+1 week</button>
    <button className="btn sm ghost" onClick={() => void act(t, { due_date: null }, `Cleared the date of “${t.title}”`)}>No date</button></>;

  const written = writeSummary({
    period: presetName, range,
    done: done.map(t => ({ title: t.title || 'Untitled task', project: proj(t.project_id)?.name })), hours: hoursDone, time: projRows,
    moved: gpRows.filter(r => r.gain > 0).filter(r => !r.sub || !gpRows.some(g => !g.sub && g.gain > 0)).slice(0, 6).map(r => ({ name: r.name, from: Math.max(0, r.end - r.gain), to: r.end })),
    worried: tops.filter(g => ['warn', 'bad'].includes(goalStatus(g.status).tone)).map(g => ({ name: g.title, label: goalStatus(g.status).label })),
    slipped: slipped.map(t => ({ title: t.title || 'Untitled task', project: proj(t.project_id)?.name })),
    quiet: quiet.map(p => p.name),
    upcoming: incUp ? upcoming.map(t => ({ title: t.title || 'Untitled task', project: proj(t.project_id)?.name, when: fmtDate(t.due_date!, { weekday: 'short', day: 'numeric', month: 'short' }) })) : null,
    upRange: fmtRange(upStart, upEnd),
  });
  const timeOf = (r: { h: number; n: number }) => (useH ? (r.h ? `${hrs(r.h)} h` : '–') : (r.n ? plural(r.n) : '–'));
  const gpLine = (r: GP) => (
    <div key={r.key} className={`gprow ${r.sub ? 'sub' : 'top'}`}>
      <a className="gpname" href={r.href} title={`${r.name} · ${r.status}`}><span className="gpdot" style={{ background: r.dot }} />{r.name}</a>
      <span className="gpbar" title={`${r.end}% of its tasks done${r.gain > 0 ? `, +${r.gain} points in this period` : ''}`} style={{ ['--c' as string]: r.color }}>
        <i style={{ width: `${Math.max(0, r.end - Math.max(0, r.gain))}%` }} />{r.gain > 0 && <b style={{ left: `${r.end - r.gain}%`, width: `${r.gain}%` }} />}</span>
      <span className="mono gpn">{r.end}%</span>
      <span className={`mono gpn ${r.gain > 0 ? 'up' : r.gain < 0 ? 'down' : ''}`} title={r.gain < 0 ? 'New tasks were added in this period, so the share done went down' : undefined}>{r.gain > 0 ? `+${r.gain}` : r.gain < 0 ? `−${-r.gain}` : '–'}</span>
      <span className="mono gpn">{timeOf(r)}</span>
    </div>);

  const doneShown = showAllDone ? [...done].reverse() : [...done].reverse().slice(0, 5);
  return (
    <>
      <div className="ph"><h1>Review</h1><span className="sub">{presetName} · {range}{self ? ' · your own tasks' : ''}</span></div>
      <PeriodPicker p={period} r={{ from: a, to: b }} onChange={setPeriod} />
      {msg && <div className="note">{msg}</div>}
      <div className="rv rv2"><div className="colm">
        <div className="panel"><div className="bigrow">
          <div><div className="big tone-good">{done.length}</div><span>tasks completed</span></div>
          <div><div className="big">{hrs(hoursDone)}</div><span>hours logged on them</span></div>
          <div><div className={`big ${slipped.length ? 'tone-bad' : ''}`}>{slipped.length}</div><span>open and overdue</span></div>
          <div><div className={`big ${upcoming.length ? 'tone-warn' : ''}`}>{upcoming.length}</div><span>coming up</span></div>
          <div><div className="big">{notesR.length}</div><span>notebook entries</span></div></div></div>
        <SummaryPanel written={written} list={summary} mode={rv.sumMode ?? 'written'} onMode={m => setRv({ ...rv, sumMode: m })} incUp={incUp}
          defaultNote={rv.inc == null ? (touchesNow ? 'on by default for current periods' : 'off by default for past periods') : null}
          onInc={v => setRv({ ...rv, inc: v })} />
        <div className="panel"><h2>Goals and projects<span>{useH ? `${hrs(hoursDone)} h logged on completed tasks` : 'no hours logged, so counting tasks'}</span></h2>
          <div className="gprow gphead"><span /><span>Progress</span><span /><span>Gain</span><span>{useH ? 'Time' : 'Done'}</span></div>
          {gpRows.map(gpLine)}
          {noGoal.length > 0 && <>{gpRows.length > 0 && <div className="gpsec">Projects without a goal</div>}{noGoal.map(gpLine)}</>}
          {loose && <div className="gprow sub"><span className="gpname muted"><span className="gpdot" style={{ background: NO_PROJECT_COLOR }} />Tasks without a project</span><span /><span /><span /><span className="mono gpn">{timeOf(loose)}</span></div>}
          {!gpRows.length && !noGoal.length && !loose && <span className="hint">No goals or active projects yet.</span>}
          {lens.dims.length > 0 && <div className="gpdims">
            <div className="presets" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}><span className="h3" style={{ margin: '0 6px 0 0' }}>Time by</span>{lens.dims.map(d => { const on = (rv.dims ?? []).includes(d.id); return (
              <button key={d.id} className={`chipbtn ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => setRv({ ...rv, dims: on ? (rv.dims ?? []).filter(x => x !== d.id) : [...(rv.dims ?? []), d.id] })}>{d.name}</button>); })}</div>
            {bdDims.length > 0 && (dimRows.length ? <><div className="h3" style={{ marginTop: 8 }}>By {bdDims.map(d => d.name.toLowerCase()).join(' × ')}</div>{bars(dimRows, dimRows.reduce((s, r) => s + metric(r), 0))}</>
                : <span className="hint">Nothing completed in this period.</span>)}</div>}
        </div>
      </div><div className="colm rvside">
        <div className="panel tone-bad"><h2>Slipped<span>{slipped.length} open and overdue</span></h2>
          {slipped.map(t => rrow(t, slipActs(t)))}{slipped.length === 0 && <span className="hint">Nothing overdue.</span>}</div>
        <div className="panel tone-warn"><h2>Coming up<span>{fmtRange(upStart, upEnd)}</span></h2>
          {upcoming.map(t => rrow(t))}{upcoming.length === 0 && <span className="hint">Nothing scheduled in this window.</span>}</div>
        <div className="panel tone-good"><h2>Done<span>{done.length} in this period</span></h2>
          {doneShown.map(t => rrow(t, t.hours ? <span className="mono muted" style={{ fontSize: 12 }}>{hrs(t.hours)} h</span>
            : editable && <button className="btn sm ghost" onClick={() => ui.openTask(t.id)}><Icon name="clock" />Add time</button>))}
          {done.length > 5 && <button className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAllDone(!showAllDone)}>{showAllDone ? 'Show the latest 5' : `Show all ${done.length}`}</button>}
          {done.length === 0 && <span className="hint">No tasks completed in this period.</span>}</div>
        <div className="panel"><h2>Quiet projects<span>nothing happened in this period</span></h2>
          {quiet.map(p => { const last = lastActivity(p, data.tasks, data.noteDates); return (
            <div key={p.id} className="rrow"><a className="t" href={projectHref(p.id)} style={{ textDecoration: 'none', color: 'inherit' }}><ProjectChip p={p} /></a>
              <span className="muted" style={{ fontSize: 12 }}>{last ? `last ${fmtDate(last, { day: 'numeric', month: 'short' })}` : 'no activity yet'}</span></div>); })}
          {quiet.length === 0 && <span className="hint">{active.length ? 'Every active project moved in this period.' : 'No active projects.'}</span>}</div>
      </div></div>
    </>
  );
}

const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`;

/** The text to share: written by Goose in sentences, or the plain list. Editable before copying. */
function SummaryPanel({ written, list, mode, onMode, incUp, defaultNote, onInc }: {
  written: string; list: string; mode: 'written' | 'list'; onMode: (m: 'written' | 'list') => void; incUp: boolean; defaultNote: string | null; onInc: (v: boolean) => void;
}) {
  const source = mode === 'written' ? written : list;
  const [text, setText] = useState(source);
  const [from, setFrom] = useState(source);
  if (from !== source) { setFrom(source); setText(source); }   // new period or new data: start again from Goose's text
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [text, mode]);   // grows with its text
  async function copy() {
    try { await navigator.clipboard.writeText(text); }
    catch { const el = document.getElementById('rv-sum') as HTMLTextAreaElement | null; el?.select(); document.execCommand('copy'); }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="panel"><h2>Summary to share
        <span className="seg" role="group" aria-label="Summary style" style={{ marginLeft: 'auto' }}>
          <button className={mode === 'written' ? 'on' : ''} onClick={() => onMode('written')}>Written</button>
          <button className={mode === 'list' ? 'on' : ''} onClick={() => onMode('list')}>List</button></span></h2>
      <textarea ref={box} id="rv-sum" className={`notes ${mode === 'written' ? 'rvwritten' : ''}`} aria-label="Summary to share" value={text} onChange={e => setText(e.target.value)}
        style={{ fontSize: mode === 'written' ? 14 : 12.5, minHeight: 120, maxHeight: 640, resize: 'vertical' }} />
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn sm" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy summary'}</button>
        {text !== source && <button className="btn sm ghost" onClick={() => setText(source)}>Undo my changes</button>}
        <span className="grow" />
        <label className="chk"><input type="checkbox" checked={incUp} onChange={e => onInc(e.target.checked)} />Include coming up{defaultNote && <span className="muted"> ({defaultNote})</span>}</label>
      </div>
    </div>);
}
