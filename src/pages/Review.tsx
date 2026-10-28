import { useState, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { listGoals, listNoteDates, listProjectsFull, listTasks, todayISO, updateTask, useLoad } from '../lib/data';
import { canEdit, type Goal, type Task } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { useLens } from '../lib/lens';
import { byDue, dueLabel, hrs, parseISO } from '../lib/format';
import { fmtDate, lastActivity } from '../lib/projects';
import { goalProgress, goalStatus } from '../lib/goals';
import { Icon } from '../components/Logo';
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

interface RV { period?: Period; preset?: string; from?: string; to?: string; months?: number; week?: boolean; inc: boolean | null; dims?: string[] }

export function Review() {
  const ws = useWorkspace();
  const ui = useUI();
  const lens = useLens();
  const self = ws.access === 'member' || ws.access === 'guest';
  const { data, error, reload } = useLoad(async () => {
    const [tasks, projects, goals, noteDates] = await Promise.all([listTasks(ws.workspace_id), listProjectsFull(ws.workspace_id), listGoals(ws.workspace_id), listNoteDates(ws.workspace_id)]);
    return { tasks, projects, goals, noteDates };
  }, [ws.workspace_id, ui.version]);
  const [rv, setRv] = useLocalPref<RV>('review', { period: { kind: 'thisWeek' }, inc: null });
  const [msg, setMsg] = useState<string | null>(null);

  const period: Period = rv.period ?? (rv.preset === 'custom' && rv.from && rv.to ? { kind: 'custom', from: rv.from, to: rv.to, months: rv.months, week: rv.week }
    : { kind: OLD[rv.preset ?? ''] ?? 'thisWeek' });
  const days = (data?.tasks ?? []).map(taskDay).filter(Boolean).sort();
  const { from: a, to: b } = periodRange(period, days[0], days[days.length - 1]);
  const today = todayISO();
  const presetName = periodName(period);
  const setPeriod = (p: Period) => setRv({ period: p, inc: null, dims: rv.dims });
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

  const editable = canEdit(ws.access);
  const rrow = (t: Task, acts?: ReactNode) => { const d = dueLabel(t.due_date, isDone(t)); const p = proj(t.project_id); return (
    <div key={t.id} className="rrow"><button className="t" onClick={() => ui.openTask(t.id)}>{t.title || 'Untitled task'}</button>
      {p && <ProjectChip p={p} />}<span className={`mono ${d.cls}`} style={{ fontSize: 12 }}>{d.text}</span>{acts && <span className="acts">{acts}</span>}</div>); };
  const nextMon = iso(addDays(monday(new Date()), 7));
  const slipActs = (t: Task) => editable && <>
    <button className="btn sm" onClick={() => void act(t, { status: 'done' }, `Marked “${t.title}” complete`)}><Icon name="check" />Done</button>
    <button className="btn sm" onClick={() => void act(t, { due_date: nextMon }, `Moved “${t.title}” to ${fmtDate(nextMon, { weekday: 'short', day: 'numeric', month: 'short' })}`)}>Next Monday</button>
    <button className="btn sm" onClick={() => { const d = iso(addDays(parseISO(t.due_date ?? today), 7)); void act(t, { due_date: d }, `Moved “${t.title}” to ${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}`); }}>+1 week</button>
    <button className="btn sm ghost" onClick={() => void act(t, { due_date: null }, `Cleared the date of “${t.title}”`)}>No date</button></>;

  return (
    <>
      <div className="ph"><h1>Review</h1><span className="sub">{presetName} · {range}{self ? ' · your own tasks' : ''}</span></div>
      <PeriodPicker p={period} r={{ from: a, to: b }} onChange={setPeriod} />
      {msg && <div className="note">{msg}</div>}
      <div className="rv"><div className="colm">
        <div className="panel"><div className="bigrow">
          <div><div className="big tone-good">{done.length}</div><span>tasks completed</span></div>
          <div><div className="big">{hrs(hoursDone)}</div><span>hours logged on them</span></div>
          <div><div className={`big ${slipped.length ? 'tone-bad' : ''}`}>{slipped.length}</div><span>open and overdue</span></div>
          <div><div className={`big ${upcoming.length ? 'tone-warn' : ''}`}>{upcoming.length}</div><span>coming up</span></div>
          <div><div className="big">{notesR.length}</div><span>notebook entries</span></div></div></div>
        <div className="panel tone-bad"><h2>Slipped<span>{slipped.length} open and overdue · decide what happens to each</span></h2>
          {slipped.map(t => rrow(t, slipActs(t)))}{slipped.length === 0 && <span className="hint">Nothing overdue.</span>}</div>
        <div className="panel tone-good"><h2>Done<span>{done.length} completed in this period</span></h2>
          {done.map(t => rrow(t, t.hours ? <span className="mono muted" style={{ fontSize: 12 }}>{hrs(t.hours)} h</span>
            : editable && <button className="btn sm ghost" onClick={() => ui.openTask(t.id)}><Icon name="clock" />Add time</button>))}
          {done.length === 0 && <span className="hint">No tasks completed in this period.</span>}</div>
        <div className="panel tone-warn"><h2>Coming up<span>{fmtRange(upStart, upEnd)}</span></h2>
          {upcoming.map(t => rrow(t))}{upcoming.length === 0 && <span className="hint">Nothing scheduled in this window.</span>}</div>
      </div><div className="colm">
        <SummaryPanel summary={summary} incUp={incUp} defaultNote={rv.inc == null ? (touchesNow ? 'on by default for current periods' : 'off by default for past periods') : null}
          onInc={v => setRv({ ...rv, inc: v })} />
        <div className="panel"><h2>Where the time went<span>{useH ? `${hrs(hoursDone)} h logged on completed tasks` : 'no hours logged, so counting tasks'}</span></h2>
          <div className="h3">By goal</div>
          {goalRows.length ? bars(goalRows) : <span className="hint">Nothing completed in this period.</span>}
          {goalRows.length > 0 && <div className="hint" style={{ fontSize: 12 }}>A task counts toward every goal its project supports, plus any goal it is linked to directly, so goals can add up to more than the total.</div>}
          <div className="h3" style={{ marginTop: 6 }}>By project</div>
          {projRows.length ? bars(projRows, projRows.reduce((s, r) => s + metric(r), 0)) : <span className="hint">Nothing completed in this period.</span>}
          {lens.dims.length > 0 && <>
            <div className="h3" style={{ marginTop: 6 }}>Break down by</div>
            <div className="presets" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{lens.dims.map(d => { const on = (rv.dims ?? []).includes(d.id); return (
              <button key={d.id} className={`chipbtn ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => setRv({ ...rv, dims: on ? (rv.dims ?? []).filter(x => x !== d.id) : [...(rv.dims ?? []), d.id] })}>{d.name}</button>); })}</div>
            {bdDims.length
              ? (dimRows.length ? <><div className="h3" style={{ marginTop: 4 }}>By {bdDims.map(d => d.name.toLowerCase()).join(' × ')}</div>{bars(dimRows, dimRows.reduce((s, r) => s + metric(r), 0))}</>
                : <span className="hint">Nothing completed in this period.</span>)
              : <span className="hint" style={{ fontSize: 12 }}>Pick one dimension, or several to combine them (for example Region × Client).</span>}</>}</div>
        <GoalsPanel goals={data.goals} tasks={data.tasks} />
        <div className="panel"><h2>Quiet projects<span>active, but nothing happened in this period</span></h2>
          {quiet.map(p => { const last = lastActivity(p, data.tasks, data.noteDates); return (
            <div key={p.id} className="rrow"><a className="t" href={projectHref(p.id)} style={{ textDecoration: 'none', color: 'inherit' }}><ProjectChip p={p} /></a>
              <span className="muted" style={{ fontSize: 12 }}>{last ? `last activity ${fmtDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'no activity yet'}</span></div>); })}
          {quiet.length === 0 && <span className="hint">{active.length ? 'Every active project moved in this period.' : 'No active projects.'}</span>}</div>
      </div></div>
    </>
  );
}

function SummaryPanel({ summary, incUp, defaultNote, onInc }: { summary: string; incUp: boolean; defaultNote: string | null; onInc: (v: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(summary); }
    catch { const el = document.getElementById('rv-sum') as HTMLTextAreaElement | null; el?.select(); document.execCommand('copy'); }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="panel"><h2>Summary to share</h2>
      <label className="chk"><input type="checkbox" checked={incUp} onChange={e => onInc(e.target.checked)} />Include upcoming tasks{defaultNote && <span className="muted"> ({defaultNote})</span>}</label>
      <textarea id="rv-sum" className="notes" readOnly style={{ fontSize: 12.5, minHeight: 200 }} value={summary} />
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy summary'}</button>
    </div>);
}

function GoalsPanel({ goals, tasks }: { goals: Goal[]; tasks: Task[] }) {
  const tops = goals.filter(g => !g.parent_id);
  return (
    <div className="panel"><h2>Goals</h2>
      {tops.map(g => { const st = goalStatus(g.status), pg = goalProgress(g, goals, tasks); return (
        <div key={g.id} className="hbar"><span className={`tonedot tone-${st.tone}`} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }} title={`${g.title} · ${st.label}`}>{g.title}</span>
          <span className="b"><i style={{ width: `${pg}%`, ['--c' as string]: st.color }} /></span><span className="mono">{pg}%</span></div>); })}
      {tops.length === 0 && <span className="hint">No goals yet.</span>}
    </div>);
}

