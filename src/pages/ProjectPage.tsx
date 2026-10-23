import { useState } from 'react';
import { useWorkspace } from '../auth/session';
import { addNote, createTask, deleteNote, listMembers, listNoteDates, listNotes, listProjectsFull, todayISO, updateNote, useLoad } from '../lib/data';
import { canEdit, canManage, NOTE_KINDS, type Member, type Note, type NoteKind, type ProjectFull, type TaskFull } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { byDue, dueLabel, parseISO } from '../lib/format';
import { fmtDate, health } from '../lib/projects';
import { Avatar, Icon, type IconName } from '../components/Logo';
import { ProjectIcon } from '../components/ProjectChip';
import { ProjectDialog } from '../components/ProjectDialog';
import { TaskViews, useTaskViews } from './Tasks';
import { AvStack, KindBadge, projectPeople } from './Projects';

type PTab = 'notebook' | 'list' | 'board' | 'calendar';

export function ProjectPage({ id }: { id: string }) {
  const ws = useWorkspace();
  const ui = useUI();
  const { data, error, reload } = useLoad(async () => {
    const [projects, members, noteDates] = await Promise.all([listProjectsFull(ws.workspace_id), listMembers(ws.workspace_id), listNoteDates(ws.workspace_id)]);
    return { project: projects.find(p => p.id === id) ?? null, count: projects.length, members, noteDates };
  }, [ws.workspace_id, id, ui.version]);
  const v = useTaskViews(id);
  const [tab, setTab] = useLocalPref<PTab>('projectTab', 'notebook');
  const [settings, setSettings] = useState(false);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <span className="muted">Loading…</span>;
  const p = data.project;
  if (!p) return <div className="empty">This project does not exist or is not visible to you. <a href="#/projects">Back to Projects</a></div>;

  const h = health(p, v.c.tasks, data.noteDates);
  const owner = data.members.find(m => m.id === p.owner_member_id);
  const canSettings = canManage(ws.access) || p.owner_member_id === ws.member_id;
  const long = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  const dates = p.kind === 'fixed'
    ? (p.start_date || p.end_date ? `${p.start_date ? fmtDate(p.start_date, long) : '?'} – ${p.end_date ? fmtDate(p.end_date, long) : '?'}` : 'No dates set')
    : (p.start_date ? `Running since ${fmtDate(p.start_date, { month: 'long', year: 'numeric' })}` : 'Ongoing');
  const tabBtn = (t: PTab, ic: IconName, label: string) =>
    <button className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}><Icon name={ic} />{label}</button>;

  return (
    <>
      <div style={{ marginBottom: 8 }}><a href="#/projects" className="muted" style={{ fontSize: 13 }}>← All projects</a></div>
      <div className="phead">
        <ProjectIcon p={p} size="lg" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><h1>{p.name}</h1>
          <div className="meta"><KindBadge p={p} /><span>{dates}</span><span className="pill" style={{ ['--c' as string]: h.color }}>{h.label}</span></div></div>
        <span style={{ flex: 1 }} />
        <div className="pagepeople"><span className="who">{owner && <Avatar m={owner} />}<span><b>{owner?.display_name ?? 'No owner'}</b><br /><span className="muted">Owner</span></span></span>
          <AvStack list={projectPeople(p, data.members)} max={7} /></div>
        {canSettings && <button className="btn sm" onClick={() => setSettings(true)}><Icon name="gear" />Project settings</button>}
      </div>
      <div className="tabs">{tabBtn('notebook', 'note', 'Notebook')}{tabBtn('list', 'list', 'List')}{tabBtn('board', 'board', 'Board')}{tabBtn('calendar', 'calendar', 'Calendar')}</div>
      {tab === 'notebook'
        ? <Notebook p={p} tasks={v.c.tasks} members={data.members} onTasks={() => setTab('list')} />
        : <TaskViews tab={tab} v={v} />}
      {settings && <ProjectDialog project={p} count={data.count} onClose={() => setSettings(false)}
        onSaved={() => { setSettings(false); ui.changed(); void reload(); }}
        onDeleted={() => { setSettings(false); ui.changed(); location.hash = '#/projects'; }} />}
    </>
  );
}

/* ---------- notebook ---------- */

function Notebook({ p, tasks, members, onTasks }: { p: ProjectFull; tasks: TaskFull[]; members: Member[]; onTasks: () => void }) {
  const ws = useWorkspace();
  const ui = useUI();
  const editable = canEdit(ws.access);
  const { data: notes, error, reload } = useLoad(() => listNotes(p.id), [p.id, ui.version]);
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<NoteKind>('note');
  const [editing, setEditing] = useState<Note | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    try { setMsg(null); setBusy(true); await fn(); await reload(); ui.changed(); return true; }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }
  async function add() {
    if (!text.trim()) { setMsg('Write something first.'); return; }
    if (await run(() => addNote(ws.workspace_id, ws.member_id, { project_id: p.id, entry_date: date || todayISO(), kind, body: text.trim() }))) { setText(''); setKind('note'); setDate(todayISO()); }
  }
  const lineTask = (n: Note, i: number, line: string) =>
    run(() => createTask(ws.workspace_id, ws.member_id, { title: line.trim().replace(/^[-*•]\s*/, ''), project_id: p.id, source_note_id: n.id, source_line: i }));

  const q = ui.q.trim().toLowerCase();
  const entries = (notes ?? []).filter(n => !q || n.body.toLowerCase().includes(q));
  const open = tasks.filter(t => t.status !== 'done').sort(byDue).slice(0, 6);
  const decisions = (notes ?? []).filter(n => n.kind === 'decision').slice(0, 5);

  return (
    <div className="nb">
      <div>
        {editable && (
          <div className="composer">
            <textarea value={text} onChange={e => setText(e.target.value)} aria-label="New notebook entry"
              placeholder="What happened? Meeting notes, decisions, parameters, links. Each line can become a task later."
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(); }} />
            <div className="row">
              <input type="date" className="field-in" value={date} onChange={e => setDate(e.target.value)} aria-label="Entry date" />
              <span className="seg" role="group" aria-label="Entry type">{NOTE_KINDS.map(k =>
                <button key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}</span>
              <span className="grow" />
              <button className="btn primary sm" disabled={busy} onClick={() => void add()}><Icon name="plus" />Add entry</button>
            </div>
          </div>)}
        {(error || msg) && <div className="err" style={{ margin: '8px 0' }}>{error || msg}</div>}
        <div className="entries">
          {entries.map(n => {
            if (editing?.id === n.id) return (
              <div className="entry" key={n.id}>
                <div className="when"><input type="date" className="field-in" style={{ width: '100%' }} value={editing.entry_date} onChange={e => setEditing({ ...editing, entry_date: e.target.value })} /></div>
                <div><textarea className="notes" style={{ minHeight: 120 }} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} aria-label="Entry text" />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <select className="field-in" value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as NoteKind })}>
                      {NOTE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
                    <span style={{ flex: 1 }} />
                    <button className="btn sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn sm primary" disabled={busy || !editing.body.trim()}
                      onClick={async () => { if (await run(() => updateNote(n.id, { entry_date: editing.entry_date, kind: editing.kind, body: editing.body.trim() }))) setEditing(null); }}>Save entry</button>
                  </div></div>
              </div>);
            const k = NOTE_KINDS.find(x => x.id === n.kind)!;
            const author = members.find(m => m.id === n.created_by_member);
            return (
              <div className="entry" key={n.id} id={`entry-${n.id}`}>
                <div className="when"><b>{parseISO(n.entry_date).getDate()}</b>{fmtDate(n.entry_date, { month: 'short', year: 'numeric' })}</div>
                <div>
                  <div className="eh">{n.kind !== 'note' && <span className="pill" style={{ ['--c' as string]: n.kind === 'decision' ? '#C8634A' : '#5B83B5' }}>{k.label}</span>}
                    {author && <span className="muted" style={{ fontSize: 12 }}>{author.display_name}</span>}<span className="grow" />
                    {editable && <><button className="iconbtn" onClick={() => setEditing(n)} aria-label="Edit entry"><Icon name="edit" /></button>
                      <button className="iconbtn" onClick={() => setDelId(n.id)} aria-label="Delete entry"><Icon name="trash" /></button></>}</div>
                  {delId === n.id && (
                    <div className="confirm" style={{ marginBottom: 8 }}>Delete this entry? Tasks made from it stay.<span style={{ flex: 1 }} />
                      <button className="btn sm" onClick={() => setDelId(null)}>Keep</button>
                      <button className="btn sm danger" onClick={() => void run(async () => { await deleteNote(n.id); setDelId(null); })}>Delete entry</button></div>)}
                  {n.body.split('\n').map((line, i) => {
                    if (!line.trim()) return <div key={i} style={{ height: '.6em' }} />;
                    const t = tasks.find(x => x.source_note_id === n.id && x.source_line === i);
                    return (
                      <div className="nline" key={i}><span className="tx">{line}</span>
                        {t ? <button className={`linked ${t.status === 'done' ? 'done' : ''}`} onClick={() => ui.openTask(t.id)}><Icon name="check" />{t.status === 'done' ? 'Task done' : 'Task'}</button>
                          : editable && <button className="mkt" onClick={() => void lineTask(n, i, line)}><Icon name="arrow" />Make task</button>}
                      </div>);
                  })}
                </div>
              </div>);
          })}
          {notes && entries.length === 0 && <div className="empty">{q ? 'No entries match the search.' : 'No entries yet. The notebook keeps the story of the project: what was discussed, what was decided and why.'}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="side-card"><h3>Open tasks</h3>
          {open.map(t => { const d = dueLabel(t.due_date); return (
            <button key={t.id} className="mini" onClick={() => ui.openTask(t.id)}><span className="t">{t.title || 'Untitled task'}</span>
              <span className={`mono ${d.cls}`} style={{ fontSize: 12 }}>{d.text}</span></button>); })}
          {open.length === 0 && <span className="muted">None</span>}
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onTasks}>All tasks <Icon name="arrow" /></button></div>
        <div className="side-card"><h3>Decisions</h3>
          {decisions.map(n => (
            <button key={n.id} className="mini" onClick={() => document.getElementById(`entry-${n.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span className="t">{n.body.split('\n').filter(Boolean).slice(-1)[0] ?? ''}</span>
              <span className="mono muted" style={{ fontSize: 12 }}>{fmtDate(n.entry_date)}</span></button>))}
          {decisions.length === 0 && <span className="muted">Entries labelled Decision collect here.</span>}</div>
      </div>
    </div>
  );
}
