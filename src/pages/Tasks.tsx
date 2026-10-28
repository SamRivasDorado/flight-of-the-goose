import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSolo } from '../lib/solo';
import { useWorkspace } from '../auth/session';
import { copyTask, createTask, listMembers, listProjects, listTasksFull, setTaskValue, todayISO, updateTask, useLoad } from '../lib/data';
import { canEdit, STATUSES, type Member, type Project, type Task, type TaskFull } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { useLens } from '../lib/lens';
import { OptPill } from '../components/Lens';
import { byDue, diffDays, dueLabel, firstName, hrs, parseISO } from '../lib/format';
import { Avatar, Icon, type IconName } from '../components/Logo';
import { NO_PROJECT_COLOR, ProjectChip } from '../components/ProjectChip';

type Tab = 'list' | 'board' | 'calendar';
type Group = string; // 'due' | 'project' | a dimension id

interface Ctx {
  tasks: TaskFull[];
  projects: Project[];
  members: Member[];
  editable: boolean;
  me: string;
  showDone: boolean;
  /** Set on a project page: the views show only this project's tasks. */
  projectId: string | null;
  lens: ReturnType<typeof useLens>;
  /** Solo mode: no assignee column or avatars. */
  solo: boolean;
  open: (id: string) => void;
  save: (id: string, patch: Partial<Task>) => Promise<void>;
  /** Sets a task's own value for a dimension (null: back to the project's default). */
  setDim: (id: string, fieldId: string, optionId: string | null) => Promise<void>;
  add: (extra: Partial<Task>, openIt?: boolean) => Promise<void>;
}

/** Loads tasks (optionally for one project), applies the top-bar search, and builds what the views need. */
export function useTaskViews(projectId: string | null = null) {
  const ws = useWorkspace();
  const ui = useUI();
  const lens = useLens();
  const { solo } = useSolo();
  const editable = canEdit(ws.access);
  const { data, error, reload } = useLoad(async () => {
    const [tasks, projects, members] = await Promise.all([listTasksFull(ws.workspace_id), listProjects(ws.workspace_id), listMembers(ws.workspace_id)]);
    return { tasks, projects, members };
  }, [ws.workspace_id, ui.version]);
  const [showDone, setShowDone] = useLocalPref('showDone', false);
  const [msg, setMsg] = useState<string | null>(null);
  const q = ui.q.trim().toLowerCase();
  const tasks = (data?.tasks ?? []).filter(t => (!projectId || t.project_id === projectId) && (!q || t.title.toLowerCase().includes(q)) && lens.task(t));
  const c: Ctx = {
    tasks, projects: data?.projects ?? [], members: data?.members ?? [], editable, me: ws.member_id, showDone, projectId, lens, solo,
    open: id => ui.openTask(id),
    save: async (id, patch) => {
      try { setMsg(null); await updateTask(id, patch); await reload(); ui.changed(); }
      catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    },
    setDim: async (id, fieldId, optionId) => {
      try { setMsg(null); await setTaskValue(id, fieldId, optionId); await lens.reload(); ui.changed(); }
      catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    },
    add: async (extra, openIt = true) => {
      // new tasks follow the Lens: its project, and its person as assignee
      const lp = lens.filt.project && lens.filt.project !== 'none' ? lens.filt.project : null;
      const full = { ...(projectId || lp ? { project_id: projectId ?? lp } : {}), ...(lens.filt.person ? { assignee_member_id: lens.filt.person } : {}), ...extra };
      if (openIt) { ui.newTask(full); return; }
      try { setMsg(null); await createTask(ws.workspace_id, ws.member_id, full); ui.changed(); }
      catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    },
  };
  const toggle = <label className="chk"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label>;
  return { c, loaded: !!data, error: error || msg, toggle, q: ui.q };
}

/** List, Board or Calendar for the tasks from useTaskViews. */
export function TaskViews({ tab, v }: { tab: 'list' | 'board' | 'calendar'; v: ReturnType<typeof useTaskViews> }) {
  return (
    <>
      {v.error && <div className="err" style={{ marginBottom: 10 }}>{v.error}</div>}
      {tab === 'list' && <ListView c={v.c} tools={v.toggle} />}
      {tab === 'board' && <BoardView c={v.c} tools={v.toggle} />}
      {tab === 'calendar' && <CalendarView c={v.c} tools={v.toggle} />}
    </>
  );
}

export function Tasks() {
  const v = useTaskViews(null);
  const [tab, setTab] = useLocalPref<Tab>('tasksTab', 'list');
  const open = v.c.tasks.filter(t => t.status !== 'done');
  const tabBtn = (id: Tab, ic: IconName, label: string) =>
    <button className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}><Icon name={ic} />{label}</button>;
  return (
    <>
      <div className="ph"><h1>Tasks</h1>{v.loaded && <span className="sub mono">{open.length} open · {v.c.tasks.length - open.length} done</span>}
        {v.q.trim() && <span className="tag">Search: {v.q}</span>}</div>
      <div className="tabs">{tabBtn('list', 'list', 'List')}{tabBtn('board', 'board', 'Board')}{tabBtn('calendar', 'calendar', 'Calendar')}</div>
      <TaskViews tab={tab} v={v} />
    </>
  );
}

/* ---------- list ---------- */

function ListView({ c, tools }: { c: Ctx; tools: React.ReactNode }) {
  const [group, setGroup] = useLocalPref<Group>('tasksGroup', 'due');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const shown = c.tasks.filter(t => c.showDone || t.status !== 'done');
  const openT = shown.filter(t => t.status !== 'done');

  let groups: { k: string; label: string; items: TaskFull[] }[];
  const groupDim = c.lens.dims.find(d => d.id === group);
  if (groupDim) {
    const val = (t: Task) => c.lens.eff(t, groupDim.id).option;
    groups = [...groupDim.options.map(o => ({ k: o.id, label: `${o.label}${groupDim.builtin ? ' priority' : ''}`, items: openT.filter(t => val(t) === o.id) })),
      { k: 'nodim', label: `No ${groupDim.name.toLowerCase()}`, items: openT.filter(t => !val(t)) }];
  } else if (group === 'project' && !c.projectId) {
    groups = [...c.projects.map(p => ({ k: p.id, label: p.name, items: openT.filter(t => t.project_id === p.id) })),
      { k: 'none', label: 'No project', items: openT.filter(t => !c.projects.some(p => p.id === t.project_id)) }];
  } else {
    const b = (t: Task) => !t.due_date ? 'nodate' : diffDays(t.due_date) < 0 ? 'overdue' : diffDays(t.due_date) === 0 ? 'today' : diffDays(t.due_date) <= 7 ? 'week' : 'later';
    groups = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'], ['later', 'Later'], ['nodate', 'No due date']]
      .map(([k, label]) => ({ k, label, items: openT.filter(t => b(t) === k) }));
  }
  const cols = (c.projectId ? 4 : 5) - (c.solo ? 1 : 0) + c.lens.dims.length;
  groups = groups.filter(g => g.items.length);
  if (c.showDone) groups.push({ k: 'done', label: 'Completed', items: shown.filter(t => t.status === 'done') });

  async function quickAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !draft.trim()) return;
    const title = draft.trim(); setDraft('');
    await c.add({ title }, false);
  }

  return (
    <>
      <div className="tools"><span className="grow" />
        <label className="chk">Group by <select className="field-in" value={group} onChange={e => setGroup(e.target.value as Group)}>
          <option value="due">Due date</option>{!c.projectId && <option value="project">Project</option>}
          {c.lens.dims.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{tools}</div>
      {c.lens.dims.length > 0 && <div className="legend" style={{ marginBottom: 8 }}>
        <span><span className="pill" style={{ ['--c' as string]: 'var(--accent)' }}>Filled</span> value set on the task itself</span>
        <span><span className="pill inh" style={{ ['--c' as string]: 'var(--accent)' }}>Dashed</span> inherited from the project’s default; set a value on the task to override it</span></div>}
      <div className="tbl-wrap">
        <table className="tl2">
          <thead><tr><th>Name</th><th>Due date</th>{!c.solo && <th>Assignee</th>}{!c.projectId && <th>Project</th>}<th>Time</th>{c.lens.dims.map(d => <th key={d.id}>{d.name}</th>)}</tr></thead>
          <tbody>
            {groups.map(g => {
              const isClosed = !!closed[g.k];
              return [
                <tr key={`s-${g.k}`} className={`sec ${isClosed ? 'closed' : ''}`} onClick={() => setClosed({ ...closed, [g.k]: !isClosed })}>
                  <td colSpan={cols}><Icon name="down" /> {g.label}<span className="n mono">{g.items.length}</span></td></tr>,
                ...(isClosed ? [] : [...g.items].sort(byDue).map(t => <Row key={t.id} t={t} c={c} />)),
              ];
            })}
            {groups.length === 0 && <tr><td colSpan={cols} className="muted" style={{ padding: 20 }}>{c.tasks.length ? 'No open tasks match.' : 'No tasks yet. Add one below.'}</td></tr>}
          </tbody>
        </table>
        {c.editable && <div className="quick"><Icon name="plus" /><input placeholder="Add a task and press Enter" aria-label="Quick add task"
          value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={quickAdd} /></div>}
      </div>
    </>
  );
}

function Row({ t, c }: { t: TaskFull; c: Ctx }) {
  const done = t.status === 'done';
  const due = dueLabel(t.due_date, done);
  const who = c.members.find(m => m.id === t.assignee_member_id);
  const subDone = t.subtasks.filter(s => s.done).length;
  return (
    <tr className={`trow ${done ? 'done' : ''}`} onClick={() => c.open(t.id)}>
      <td className="name"><div className="namewrap">
        <button className={`circ ${done ? 'on' : ''}`} disabled={!c.editable} aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          onClick={e => { e.stopPropagation(); void c.save(t.id, { status: done ? 'todo' : 'done' }); }}><Icon name="check" /></button>
        <span className="ttl">{t.title || <span className="muted">Untitled task</span>}</span>
        {t.subtasks.length > 0 && <span className="subn mono">{subDone}/{t.subtasks.length}<Icon name="sub" /></span>}
        {t.goal_id && <span className="subn" title="Linked to a goal"><Icon name="target" /></span>}
      </div></td>
      <td className="mono"><span className={due.cls}>{due.text}</span></td>
      {!c.solo && <td>{who ? <span className="who"><Avatar m={who} size="sm" />{firstName(who.display_name)}
        {t.collaborator_ids.length > 0 && <span className="muted"> +{t.collaborator_ids.length}</span>}</span> : <span className="muted">—</span>}</td>}
      {!c.projectId && <td><CellPick on={c.editable} label={`Project of ${t.title || 'this task'}`} value={t.project_id ?? ''}
        onPick={v => void c.save(t.id, { project_id: v || null })}
        options={[['', 'No project'], ...c.projects.filter(p => p.status !== 'closed' || p.id === t.project_id).map(p => [p.id, p.name] as [string, string])]}>
        <ProjectChip p={c.projects.find(p => p.id === t.project_id)} /></CellPick></td>}
      <td className="mono">{t.hours ? `${hrs(t.hours)} h` : ''}</td>
      {c.lens.dims.map(d => {
        const v = c.lens.eff(t, d.id), own = c.lens.taskOwn(t.id, d.id);
        const inh = t.project_id ? d.options.find(o => o.id === c.lens.projectDefault(t.project_id!, d.id)) : undefined;
        return <td key={d.id}><CellPick on={c.editable} label={`${d.name} of ${t.title || 'this task'}`} value={own ?? ''}
          onPick={o => void c.setDim(t.id, d.id, o || null)}
          options={[['', inh ? `${inh.label} (from project)` : '—'], ...d.options.map(o => [o.id, o.label] as [string, string])]}>
          {v.option ? <OptPill dim={d} option={v.option} inherited={v.inherited} /> : <span className="muted">—</span>}</CellPick></td>;
      })}
    </tr>
  );
}

/** A cell in the list that shows its chip and opens a drop-down to change it, without opening the task. */
function CellPick({ on, label, value, options, onPick, children }: {
  on: boolean; label: string; value: string; options: [string, string][]; onPick: (v: string) => void; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <span className="cellpick" onClick={e => e.stopPropagation()} title="Click to change">
      {children}<Icon name="down" />
      <select aria-label={label} value={value} onChange={e => { if (e.target.value !== value) onPick(e.target.value); }}>
        {options.map(([v, l]) => <option key={v || 'none'} value={v}>{l}</option>)}</select>
    </span>);
}

/* ---------- board ---------- */

function useDrop(onDrop: (taskId: string, target: string, e: DragEvent) => void) {
  const [over, setOver] = useState<string | null>(null);
  return {
    over,
    props: (target: string) => ({
      onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(target); },
      onDragLeave: () => setOver(o => (o === target ? null : o)),
      onDrop: (e: DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/task'); if (id) onDrop(id, target, e); },
    }),
  };
}
const dragProps = (id: string, editable: boolean) => editable ? {
  draggable: true,
  onDragStart: (e: DragEvent) => { e.dataTransfer.setData('text/task', id); e.dataTransfer.effectAllowed = 'copyMove'; (e.currentTarget as HTMLElement).classList.add('dragging'); },
  onDragEnd: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('dragging'),
} : {};

function BoardView({ c, tools }: { c: Ctx; tools: React.ReactNode }) {
  const drop = useDrop((id, st) => { const t = c.tasks.find(x => x.id === id); if (t && t.status !== st) void c.save(id, { status: st as Task['status'] }); });
  return (
    <>
      <div className="tools"><span className="grow" />{tools}</div>
      <div className="board">{STATUSES.map(st => {
        const items = c.tasks.filter(t => t.status === st.id && (c.showDone || t.status !== 'done')).sort(byDue);
        return (
          <div key={st.id} className={`col ${drop.over === st.id ? 'over' : ''}`} {...(c.editable ? drop.props(st.id) : {})}>
            <h3><i className="dot" style={{ ['--c' as string]: st.color }} />{st.label}<span className="mono">{items.length}</span></h3>
            {st.id === 'done' && !c.showDone && <span className="muted" style={{ fontSize: 12, margin: '0 4px' }}>Tick “Show completed” to see finished tasks.</span>}
            {items.map(t => {
              const who = c.members.find(m => m.id === t.assignee_member_id), due = dueLabel(t.due_date, t.status === 'done');
              const p = c.projects.find(x => x.id === t.project_id);
              return (
                <button key={t.id} className={`card ${t.status === 'done' ? 'done' : ''}`} onClick={() => c.open(t.id)} {...dragProps(t.id, c.editable)}>
                  <span className="t">{t.title || 'Untitled task'}</span>
                  <span className="meta">{who && !c.solo && <Avatar m={who} size="sm" />}{p && !c.projectId && <ProjectChip p={p} />}{c.lens.dims[0] && (() => { const v = c.lens.eff(t, c.lens.dims[0].id); return <OptPill dim={c.lens.dims[0]} option={v.option} inherited={v.inherited} />; })()}
                    {due.text && <span className={`mono ${due.cls}`}>{due.text}</span>}{t.hours ? <span className="mono muted">{hrs(t.hours)} h</span> : null}</span>
                </button>);
            })}
            {c.editable && <button className="btn ghost sm" onClick={() => void c.add({ status: st.id })}><Icon name="plus" />Add task</button>}
          </div>);
      })}</div>
    </>
  );
}

/* ---------- calendar ---------- */

function CalendarView({ c, tools }: { c: Ctx; tools: React.ReactNode }) {
  const [weekStart, setWeekStart] = useLocalPref<0 | 1>('weekStart', 1);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [askOn, setAskOn] = useLocalPref('dropAsk', true);
  const [ask, setAsk] = useState<{ t: TaskFull; date: string; x: number; y: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ws = useWorkspace(), ui = useUI();
  const dayName = (k: string) => parseISO(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  async function copyTo(t: TaskFull, k: string) {
    try { await copyTask(ws.workspace_id, ws.member_id, t, k); setNote(`Copied “${t.title || 'Untitled task'}” to ${dayName(k)}.`); ui.changed(); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
  }
  const drop = useDrop((id, k, e) => {
    const t = c.tasks.find(x => x.id === id);
    if (!t) return;
    if (e.altKey) { void copyTo(t, k); return; } // Alt while dropping: copy straight away
    if (t.due_date === k) return;
    if (askOn) setAsk({ t, date: k, x: e.clientX, y: e.clientY });
    else void c.save(id, { due_date: k });
  });

  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const start = new Date(month); start.setDate(1 - ((month.getDay() - weekStart + 7) % 7));
  const end = new Date(last); end.setDate(last.getDate() + ((weekStart + 6 - last.getDay() + 7) % 7));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = todayISO();
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  const shift = (n: number) => setMonth(n === 0 ? (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })() : new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <div className="tools">
        <button className="iconbtn" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="left" /></button>
        <button className="btn sm" onClick={() => shift(0)}>Today</button>
        <button className="iconbtn" onClick={() => shift(1)} aria-label="Next month"><Icon name="right" /></button>
        <span className="month">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span><span className="grow" />
        <label className="chk" title="When you drag a task to another day"><input type="checkbox" checked={askOn} onChange={e => setAskOn(e.target.checked)} />Ask to move or copy</label>
        <span className="seg" role="group" aria-label="Week starts on">
          <button className={weekStart === 0 ? 'on' : ''} onClick={() => setWeekStart(0)}>Sun</button>
          <button className={weekStart === 1 ? 'on' : ''} onClick={() => setWeekStart(1)}>Mon</button></span>
        {tools}
      </div>
      {note && <div className="note" style={{ marginBottom: 10 }}>{note}</div>}
      {ask && <DropAsk a={ask} onClose={() => setAsk(null)}
        onMove={() => { setAsk(null); void c.save(ask.t.id, { due_date: ask.date }); setNote(`Moved “${ask.t.title || 'Untitled task'}” to ${dayName(ask.date)}.`); }}
        onCopy={() => { setAsk(null); void copyTo(ask.t, ask.date); }} />}
      <div className="cal-wrap"><div className="cal">
        {Array.from({ length: 7 }, (_, i) => <div key={`h${i}`} className="dow">{names[(i + weekStart) % 7]}</div>)}
        {days.map(d => {
          const k = todayISO(d);
          const items = c.tasks.filter(t => t.due_date === k && (c.showDone || t.status !== 'done'));
          return (
            <div key={k} className={`day ${d.getMonth() !== month.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${drop.over === k ? 'over' : ''}`} {...(c.editable ? drop.props(k) : {})}>
              <div className="dn"><b>{d.getDate() === 1 ? `${d.toLocaleDateString('en-GB', { month: 'short' })} ` : ''}{d.getDate()}</b>
                {c.editable && <button className="add" aria-label={`Add task on ${parseISO(k).toLocaleDateString('en-GB')}`} onClick={() => void c.add({ due_date: k })}><Icon name="plus" /></button>}</div>
              {items.map(t => {
                const p = c.projects.find(x => x.id === t.project_id), who = c.members.find(m => m.id === t.assignee_member_id);
                return (
                  <button key={t.id} className={`chip ${t.status === 'done' ? 'done' : ''}`} style={{ ['--c' as string]: p ? p.color : NO_PROJECT_COLOR }}
                    title={p ? p.name : 'No project'} onClick={() => c.open(t.id)} {...dragProps(t.id, c.editable)}>
                    <span className="t">{t.title || 'Untitled task'}</span>
                    {who && who.id !== c.me && <Avatar m={who} size="xs" />}
                  </button>);
              })}
            </div>);
        })}
      </div></div>
    </>
  );
}

/** "Move here / Copy here" after dropping a task on another day (as in the prototype). */
function DropAsk({ a, onMove, onCopy, onClose }: { a: { t: TaskFull; date: string; x: number; y: number }; onMove: () => void; onCopy: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: a.x + 12, top: a.y + 12 });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(12, Math.min(a.x + 12, innerWidth - r.width - 12)), top: Math.max(12, Math.min(a.y + 12, innerHeight - r.height - 12)) });
    ref.current!.querySelector<HTMLButtonElement>('.btn.primary')?.focus();
  }, [a]);
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    addEventListener('keydown', key); addEventListener('mousedown', click);
    return () => { removeEventListener('keydown', key); removeEventListener('mousedown', click); };
  }, [onClose]);
  const when = parseISO(a.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return createPortal(
    <div ref={ref} className="dropask" role="dialog" aria-label="Move or copy task" style={pos}>
      <div className="dq">“{a.t.title || 'Untitled task'}” to <b>{when}</b></div>
      <div className="drow"><button className="btn primary sm" onClick={onMove}>Move here</button><button className="btn sm" onClick={onCopy}>Copy here</button>
        <button className="btn sm ghost" onClick={onClose}>Cancel</button></div>
      <div className="hint" style={{ fontSize: 12 }}>A copy is a new open task with the same project, goal, dimensions and subtasks. Tip: hold Alt while dropping to copy straight away.</div>
    </div>, document.body);
}
