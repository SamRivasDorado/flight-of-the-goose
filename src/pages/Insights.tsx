import { useEffect, useRef, useState } from 'react';
import type { Chart as ChartT } from 'chart.js';
import { useWorkspace } from '../auth/session';
import { getMySettings, listProjects, listTasks, saveMySettings, useLoad } from '../lib/data';
import { STATUSES, type Project, type Task } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { buckets, byWeek, inRange, PERIODS, range, rangeLabel, taskDay, type Period } from '../lib/period';
import { useLens } from '../lib/lens';
import { diffDays, hrs, parseISO } from '../lib/format';
import { Icon } from '../components/Logo';
import { NO_PROJECT_COLOR } from '../components/ProjectChip';

type By = string; // 'project' | 'status' | 'month' | a dimension id
type ChartType = 'doughnut' | 'pie' | 'bar' | 'hbar';
interface Cfg { id?: string; by: By; filter: 'all' | 'open' | 'done'; measure: 'count' | 'hours'; scope: string; type: ChartType }
interface Datum { label: string; color: string; value: number; order?: string }

const GROUPS: [By, string][] = [['project', 'Project'], ['status', 'Status'], ['month', 'Due month']];
const DEFAULT: Cfg = { by: 'project', filter: 'all', measure: 'hours', scope: 'all', type: 'doughnut' };

function aggregate(cfg: Cfg, tasks: Task[], projects: Project[], lens: ReturnType<typeof useLens>): Datum[] {
  let ts = tasks.filter(t => cfg.scope === 'all' || t.project_id === cfg.scope);
  if (cfg.filter === 'open') ts = ts.filter(t => t.status !== 'done'); else if (cfg.filter === 'done') ts = ts.filter(t => t.status === 'done');
  const val = (t: Task) => cfg.measure === 'count' ? 1 : Number(t.hours) || 0;
  const m = new Map<string, Datum>();
  const add = (k: string, label: string, color: string, t: Task, order?: string) => { if (!m.has(k)) m.set(k, { label, color, value: 0, order }); m.get(k)!.value += val(t); };
  ts.forEach(t => {
    if (cfg.by === 'project') { const p = projects.find(x => x.id === t.project_id); add(p ? p.id : '_', p ? p.name : 'No project', p ? p.color : NO_PROJECT_COLOR, t); }
    else if (cfg.by === 'status') { const s = STATUSES.find(x => x.id === t.status)!; add(s.id, s.label, s.color, t); }
    else if (cfg.by !== 'month') { const d = lens.dims.find(x => x.id === cfg.by); if (!d) return; const o = d.options.find(x => x.id === lens.eff(t, d.id).option); add(o ? o.id : '_', o ? o.label : 'Not set', o ? o.color : NO_PROJECT_COLOR, t); }
    else if (!t.due_date) add('_', 'No date', NO_PROJECT_COLOR, t, '9999');
    else { const k = t.due_date.slice(0, 7); add(k, parseISO(`${k}-01`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), '#6B9160', t, k); }
  });
  const out = [...m.values()].filter(d => d.value > 0);
  out.sort(cfg.by === 'month' ? (a, b) => (a.order! < b.order! ? -1 : 1) : (a, b) => b.value - a.value);
  return out;
}
function title(c: Cfg, groups: [string, string][] = GROUPS) {
  const fl = { all: '', open: 'open ', done: 'completed ' }[c.filter];
  const what = c.measure === 'count' ? `${fl ? fl[0].toUpperCase() + fl.slice(1) : 'T'}${fl ? 'tasks' : 'asks'}` : `Hours logged${fl ? ` on ${fl}tasks` : ''}`;
  return `${what} by ${(groups.find(g => g[0] === c.by)?.[1] ?? 'a removed dimension').toLowerCase()}`;
}

/** A Chart.js chart that redraws when its data or type changes (the library loads on first use). */
function ChartBox({ data, type, label }: { data: Datum[]; type: ChartType; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([data, type]) + (document.documentElement.dataset.palette ?? '');
  useEffect(() => {
    let chart: ChartT | null = null, live = true;
    void import('chart.js/auto').then(({ default: Chart }) => {
      if (!live || !ref.current) return;
      const css = getComputedStyle(document.documentElement);
      const fg = css.getPropertyValue('--muted').trim(), grid = css.getPropertyValue('--line').trim(), surf = css.getPropertyValue('--surface').trim();
      Chart.defaults.font.family = css.getPropertyValue('--f-content');
      const pie = type === 'pie' || type === 'doughnut', tot = data.reduce((s, d) => s + d.value, 0) || 1;
      chart = new Chart(ref.current, {
        type: type === 'hbar' ? 'bar' : type,
        data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderColor: pie ? surf : 'transparent', borderWidth: pie ? 2 : 0, borderRadius: pie ? 0 : 5, maxBarThickness: 42 }] },
        options: {
          indexAxis: type === 'hbar' ? 'y' : 'x', maintainAspectRatio: false, animation: { duration: 300 }, ...(type === 'doughnut' ? { cutout: '58%' } : {}),
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: { raw: unknown }) => ` ${hrs(Number(c.raw))} (${Math.round(Number(c.raw) / tot * 100)}%)` } } },
          scales: pie ? {} : {
            x: { ticks: { color: fg }, grid: { display: type === 'hbar', color: grid }, border: { color: grid }, beginAtZero: true },
            y: { ticks: { color: fg, precision: 0 }, grid: { display: type !== 'hbar', color: grid }, border: { color: grid }, beginAtZero: true } },
        },
      } as never);
    });
    return () => { live = false; chart?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="canv"><canvas ref={ref} aria-label={label} /></div>;
}

function ChartCard({ c, tasks, projects, onRemove, plain, when }: { c: Cfg; tasks: Task[]; projects: Project[]; onRemove?: () => void; plain?: boolean; when: string }) {
  const lens = useLens(), groups: [string, string][] = [...GROUPS, ...lens.dims.map(d => [d.id, d.name] as [string, string])];
  const data = aggregate(c, tasks, projects, lens), tot = data.reduce((s, d) => s + d.value, 0) || 1, unit = c.measure === 'hours' ? ' h' : '';
  const scope = c.scope === 'all' ? 'All projects' : projects.find(p => p.id === c.scope)?.name ?? 'Deleted project';
  return (
    <div className="ccard" style={plain ? { border: 0, padding: 0 } : undefined}>
      <h3><span>{title(c, groups)}</span>{onRemove && <button className="iconbtn" onClick={onRemove} aria-label="Remove chart"><Icon name="x" /></button>}</h3>
      <div className="sub2">{scope} · {when}</div>
      {data.length ? <>
        <ChartBox data={data} type={c.type} label={title(c, groups)} />
        <table className="ltab"><tbody>{data.map(d => <tr key={d.label}><td><span className="sw2" style={{ ['--c' as string]: d.color }} />{d.label}</td>
          <td>{hrs(d.value)}{unit}</td><td>{Math.round(d.value / tot * 100)}%</td></tr>)}</tbody></table>
      </> : <div className="empty">{c.measure === 'hours' ? 'No hours logged on matching tasks yet.' : 'No matching tasks.'}</div>}
    </div>);
}

export function Insights() {
  const ws = useWorkspace();
  const ui = useUI();
  const lens = useLens();
  const { data, error } = useLoad(async () => {
    const [tasks, projects, settings] = await Promise.all([listTasks(ws.workspace_id), listProjects(ws.workspace_id), getMySettings(ws.member_id)]);
    return { tasks, projects, dash: (settings.dash as Cfg[] | undefined) ?? [] };
  }, [ws.workspace_id, ui.version]);
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const [dash, setDash] = useState<Cfg[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [period, setPeriod] = useLocalPref<Period>('insightsPeriod', { kind: 'last30' });
  useEffect(() => { if (data) setDash(data.dash); }, [data]);

  if (error) return <div className="err">{error}</div>;
  if (!data || !dash) return <span className="muted">Loading…</span>;
  const self = ws.access === 'member' || ws.access === 'guest';
  const q = ui.q.trim().toLowerCase();
  const base = data.tasks.filter(t => (!q || t.title.toLowerCase().includes(q)) && lens.task(t, self ? ws.member_id : null));
  // the period: finished tasks count on the day they were completed, open ones on their due date (or creation day)
  const days = base.map(taskDay).filter(Boolean).sort();
  const r = range(period, days[0], days[days.length - 1]), when = period.kind === 'custom' || period.kind === 'all' ? rangeLabel(r) : `${PERIODS.find(x => x[0] === period.kind)?.[1]} (${rangeLabel(r)})`;
  const all = base.filter(t => inRange(taskDay(t), r));
  const open = base.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  const doneIn = all.filter(t => t.status === 'done');
  const hours = all.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const dueIn = base.filter(t => t.due_date && inRange(t.due_date, r)), dueDone = dueIn.filter(t => t.status === 'done').length;

  async function store(next: Cfg[], note: string) {
    const before = dash; setDash(next);
    try { await saveMySettings(ws.member_id, { dash: next }); setMsg(note); }
    catch (e) { setDash(before); setMsg(e instanceof Error ? e.message : String(e)); }
  }
  const sel = <K extends keyof Cfg>(k: K, opts: [string, string][]) => (
    <select className="field-in" value={cfg[k] as string} onChange={e => setCfg({ ...cfg, [k]: e.target.value })}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>);
  const bs = buckets(r), perWeek = byWeek(r);
  const overTime = bs.map(b => ({ label: b.label, value: doneIn.filter(t => inRange(taskDay(t), b)).length, color: '#6B9160' }));
  const setKind = (kind: Period['kind']) => setPeriod(kind === 'custom' ? { kind, from: r.from, to: r.to } : { kind });

  return (
    <>
      <div className="ph"><h1>Insights</h1><span className="sub">{self ? `Your own tasks: ${all.length}` : `${all.length} tasks across ${data.projects.length} projects`} in this period{q ? ` · search: ${ui.q}` : ''}</span></div>
      <div className="periodbar">
        <label className="chk">Period <select className="field-in" aria-label="Period" value={period.kind} onChange={e => setKind(e.target.value as Period['kind'])}>
          {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {period.kind === 'custom'
          ? <><label className="chk">From <input type="date" className="field-in" aria-label="From" value={r.from} max={r.to} onChange={e => e.target.value && setPeriod({ ...period, from: e.target.value })} /></label>
              <label className="chk">To <input type="date" className="field-in" aria-label="To" value={r.to} min={r.from} onChange={e => e.target.value && setPeriod({ ...period, to: e.target.value })} /></label></>
          : <span className="mono muted">{rangeLabel(r)}</span>}
        <span className="hint">Finished tasks count on the day they were completed; open tasks on their due date. Hours follow their task.</span>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="k">Completed in the period</div><div className="v">{doneIn.length}</div></div>
        <div className="kpi"><div className="k">Hours logged in the period</div><div className="v">{hrs(hours)}</div></div>
        <div className="kpi" title="Of the tasks due in this period, how many are done"><div className="k">Due in the period: done</div><div className="v">{dueIn.length ? `${Math.round(dueDone / dueIn.length * 100)}%` : '–'}</div>
          {dueIn.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{dueDone} of {dueIn.length}</div>}</div>
        <div className="kpi"><div className="k">Open now</div><div className="v">{open.length}</div></div>
        <div className="kpi"><div className="k">Overdue now</div><div className="v" style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>{overdue}</div></div>
      </div>
      <div className="builder">
        <div className="ctrls">
          <label>Group by {sel('by', [...GROUPS, ...lens.dims.map(d => [d.id, d.name] as [string, string])])}</label>
          <label>Tasks {sel('filter', [['all', 'All tasks'], ['open', 'Open only'], ['done', 'Completed only']])}</label>
          <label>Measure {sel('measure', [['count', 'Number of tasks'], ['hours', 'Hours logged']])}</label>
          <label>Projects {sel('scope', [['all', 'All projects'], ...data.projects.map(p => [p.id, p.name] as [string, string])])}</label>
          <label>Chart {sel('type', [['doughnut', 'Doughnut'], ['pie', 'Pie'], ['bar', 'Columns'], ['hbar', 'Bars']])}</label>
          <button className="btn primary" onClick={() => void store([...dash, { ...cfg, id: crypto.randomUUID() }], 'Added to your dashboard.')}><Icon name="plus" />Save to dashboard</button>
        </div>
        <div className="preview">
          <ChartCard c={cfg} tasks={all} projects={data.projects} plain when={when} />
          <div className="hint">Hours by project answers “where did our time go” more honestly than counting tasks, because a quick email and a three-day calculation no longer weigh the same. Group by Priority or any other dimension to see where effort goes; the Lens at the top filters these charts too.</div>
        </div>
      </div>
      {msg && <div className="note">{msg}</div>}
      <h2 className="sech" style={{ marginTop: 6 }}>Dashboard <span className="muted" style={{ fontSize: 13 }}>· charts you saved stay here, update as your tasks change and follow the period above</span></h2>
      <div className="dash">
        <div className="ccard"><h3><span>Tasks completed per {perWeek ? 'week' : 'month'}</span></h3><div className="sub2">{when}</div>
          <ChartBox data={overTime} type="bar" label={`Tasks completed per ${perWeek ? 'week' : 'month'}`} /></div>
        {dash.map((c, i) => <ChartCard key={c.id ?? i} c={c} tasks={all} projects={data.projects} when={when}
          onRemove={() => void store(dash.filter((_, j) => j !== i), 'Chart removed.')} />)}
      </div>
    </>
  );
}
