import { useEffect, useState, type KeyboardEvent } from 'react';
import { useWorkspace } from '../auth/session';
import {
  addSubtask, createTask, deleteSubtask, deleteTask, getTaskFull, listGoalRefs, listMembers, listProjects,
  setCollaborator, updateSubtask, updateTask, useLoad,
} from '../lib/data';
import { canEdit, STATUSES, type Subtask, type Task, type TaskFull } from '../lib/types';
import { useUI } from '../lib/ui';
import { dueLabel, firstName } from '../lib/format';
import { Avatar, Icon } from './Logo';
import { ProjectChip } from './ProjectChip';

/** The task details panel that slides up from the bottom (as in the prototype).
    A new task is a draft until Create task is pressed; an existing one saves as you edit. */
export function TaskSheet() {
  const { openTaskId, openTask, draft, changed } = useUI();
  if (!openTaskId) return null;
  const isNew = openTaskId.startsWith('new:');
  return <Sheet key={openTaskId} id={isNew ? null : openTaskId} defaults={isNew ? draft ?? {} : null}
                close={() => openTask(null)} changed={changed} />;
}

interface SheetProps {
  id: string | null;
  defaults: Partial<Task> | null;
  close: () => void;
  changed: () => void;
}

function Sheet({ id, defaults, close, changed }: SheetProps) {
  const ws = useWorkspace();
  const isNew = id == null;
  const editable = canEdit(ws.access);
  const { data: lists } = useLoad(async () => {
    const [members, projects, goals] = await Promise.all([listMembers(ws.workspace_id), listProjects(ws.workspace_id), listGoalRefs(ws.workspace_id)]);
    return { members, projects, goals };
  }, [ws.workspace_id]);
  const [t, setT] = useState<TaskFull | null>(() => isNew ? blankTask(ws.workspace_id, ws.member_id, defaults ?? {}) : null);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState(defaults?.title ?? '');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [subDraft, setSubDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let live = true;
    getTaskFull(id).then(x => {
      if (!live) return;
      if (!x) { setMissing(true); return; }
      setT(x); setTitle(x.title); setDesc(x.description); setHours(x.hours == null ? '' : String(x.hours));
    }).catch(e => setErr(String(e?.message ?? e)));
    return () => { live = false; };
  }, [id, isNew]);

  async function run(fn: () => Promise<unknown>) {
    try { setErr(null); await fn(); changed(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); return false; }
  }
  /** Change fields: kept in the draft for a new task, saved straight away for an existing one. */
  const patch = (p: Partial<Task>) => {
    if (!t) return;
    setT({ ...t, ...p });
    if (!isNew) void run(() => updateTask(t.id, p));
  };
  const hoursValue = () => { const h = hours === '' ? null : Math.max(0, Number(hours)); return Number.isNaN(h) ? t?.hours ?? null : h; };

  /** New task: save everything in one go. */
  async function create() {
    if (!t) return;
    if (!title.trim()) { setErr('Give the task a name.'); return; }
    setBusy(true);
    const ok = await run(async () => {
      const saved = await createTask(ws.workspace_id, ws.member_id, {
        title: title.trim(), description: desc, project_id: t.project_id, goal_id: t.goal_id, assignee_member_id: t.assignee_member_id,
        due_date: t.due_date, status: t.status, hours: hoursValue(),
        ...(t.status === 'done' ? { completed_at: new Date().toISOString().slice(0, 10) } : {}),
      });
      for (const [i, s] of t.subtasks.entries()) { const x = await addSubtask(saved.id, s.title, i); if (s.done) await updateSubtask(x.id, { done: true }); }
      for (const m of t.collaborator_ids) await setCollaborator(saved.id, m, true);
    });
    setBusy(false);
    if (ok) close();
  }

  /** Existing task: save anything still being typed, then close. */
  async function saveAndClose() {
    if (t && editable && !isNew) {
      const p: Partial<Task> = {};
      if (title !== t.title) p.title = title;
      if (desc !== t.description) p.description = desc;
      const h = hoursValue(); if (h !== t.hours) p.hours = h;
      if (Object.keys(p).length && !(await run(() => updateTask(t.id, p)))) return;
    }
    close();
  }

  const dirtyDraft = isNew && (title.trim() || desc.trim() || (t?.subtasks.length ?? 0) > 0);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isNew) { if (dirtyDraft) setErr('Press Create task to save it, or Cancel to discard it.'); else close(); }
      else void saveAndClose();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });

  const shell = (body: React.ReactNode) => (
    <div className="sheet" role="dialog" aria-label="Task details"><div className="sh">{body}<span className="grow" />
      <button className="iconbtn" onClick={close} aria-label="Close"><Icon name="x" /></button></div></div>);
  if (missing) return shell(<span>This task no longer exists or is not visible to you.</span>);
  if (!t || !lists) return shell(<span className="muted">Loading…</span>);

  const project = lists.projects.find(p => p.id === t.project_id);
  const done = t.status === 'done';
  const subDone = t.subtasks.filter(s => s.done).length;

  const addSub = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !subDraft.trim()) return;
    const text = subDraft.trim(); setSubDraft('');
    if (isNew) { setT({ ...t, subtasks: [...t.subtasks, { id: `d${Date.now()}`, task_id: '', title: text, done: false, position: t.subtasks.length }] }); return; }
    await run(async () => { const s = await addSubtask(t.id, text, t.subtasks.length); setT(cur => cur && { ...cur, subtasks: [...cur.subtasks, s] }); });
  };
  const toggleSub = (s: Subtask) => {
    setT({ ...t, subtasks: t.subtasks.map(x => x.id === s.id ? { ...x, done: !x.done } : x) });
    if (!isNew) void run(() => updateSubtask(s.id, { done: !s.done }));
  };
  const removeSub = (s: Subtask) => {
    setT({ ...t, subtasks: t.subtasks.filter(x => x.id !== s.id) });
    if (!isNew) void run(() => deleteSubtask(s.id));
  };
  const toggleCollab = (m: string, on: boolean) => {
    setT({ ...t, collaborator_ids: on ? t.collaborator_ids.filter(x => x !== m) : [...t.collaborator_ids, m] });
    if (!isNew) void run(() => setCollaborator(t.id, m, !on));
  };
  const created = isNew ? '' : dueLabel(t.created_at.slice(0, 10), true).text;
  const completed = t.completed_at ? dueLabel(t.completed_at, true).text : '';

  return (
    <div className="sheet" role="dialog" aria-label={isNew ? 'New task' : 'Task details'}>
      <div className="sh">
        {isNew ? <b>New task</b> : (
          <button className={`donebtn ${done ? 'on' : ''}`} disabled={!editable} onClick={() => patch({ status: done ? 'todo' : 'done' })}>
            <Icon name="check" />{done ? 'Completed' : 'Mark complete'}</button>)}
        {project && <ProjectChip p={project} />}
        <span className="grow" />
        {editable && !isNew && <button className="iconbtn" onClick={() => setConfirmDel(true)} aria-label="Delete task" title="Delete task"><Icon name="trash" /></button>}
        <button className="iconbtn" onClick={() => (isNew ? close() : void saveAndClose())} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="sbody">
        <div className="left">
          {confirmDel && (
            <div className="confirm">Delete this task and its subtasks?<span style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button>
              <button className="btn sm danger" onClick={() => run(async () => { await deleteTask(t.id); close(); })}>Delete task</button></div>)}
          <textarea className="d-title" rows={1} placeholder="Task name" aria-label="Task name" value={title} readOnly={!editable}
            autoFocus={!title} onChange={e => setTitle(e.target.value)} onBlur={() => !isNew && title !== t.title && patch({ title })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
          <div>
            <div className="h3">Description</div>
            <textarea className="notes" placeholder="Context, links, decisions" aria-label="Description" style={{ marginTop: 6 }} value={desc} readOnly={!editable}
              onChange={e => setDesc(e.target.value)} onBlur={() => !isNew && desc !== t.description && patch({ description: desc })} />
          </div>
          <div>
            <div className="h3">Subtasks {t.subtasks.length > 0 && <span className="mono">{subDone}/{t.subtasks.length}</span>}</div>
            <div className="subs" style={{ marginTop: 6 }}>
              {t.subtasks.map(s => (
                <div key={s.id} className={`sub ${s.done ? 'done' : ''}`}>
                  <button className={`circ ${s.done ? 'on' : ''}`} disabled={!editable} aria-label="Toggle subtask" onClick={() => toggleSub(s)}><Icon name="check" /></button>
                  <span className="t">{s.title}</span>
                  {editable && <button className="iconbtn" aria-label="Remove subtask" onClick={() => removeSub(s)}><Icon name="x" /></button>}
                </div>))}
              {editable && <div className="quick" style={{ padding: '6px 4px' }}><Icon name="plus" />
                <input placeholder="Add a subtask and press Enter" aria-label="Add subtask" value={subDraft} onChange={e => setSubDraft(e.target.value)} onKeyDown={addSub} /></div>}
            </div>
          </div>
        </div>
        <div className="right">
          <dl className="props">
            <dt><label htmlFor="d-proj">Project</label></dt>
            <dd><select id="d-proj" className="field-in" disabled={!editable} value={t.project_id ?? ''} onChange={e => patch({ project_id: e.target.value || null })}>
              <option value="">No project</option>{lists.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></dd>
            <dt><label htmlFor="d-goal">Goal</label></dt>
            <dd><select id="d-goal" className="field-in" disabled={!editable} value={t.goal_id ?? ''} onChange={e => patch({ goal_id: e.target.value || null })}>
              <option value="">{lists.goals.length ? 'None' : 'No goals yet'}</option>
              {lists.goals.filter(g => !g.parent_id).flatMap(g => [
                <option key={g.id} value={g.id}>{g.title}</option>,
                ...lists.goals.filter(k => k.parent_id === g.id).map(k => <option key={k.id} value={k.id}>{'  ↳ ' + k.title}</option>)])}</select></dd>
            <dt><label htmlFor="d-asg">Assignee</label></dt>
            <dd><select id="d-asg" className="field-in" disabled={!editable} value={t.assignee_member_id ?? ''} onChange={e => patch({ assignee_member_id: e.target.value || null })}>
              <option value="">Nobody yet</option>
              {lists.members.filter(m => m.access !== 'guest' || m.id === t.assignee_member_id).map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></dd>
            <dt>Collaborators</dt>
            <dd><div className="pplpick">
              {lists.members.filter(m => m.id !== t.assignee_member_id).map(m => {
                const on = t.collaborator_ids.includes(m.id);
                return <button key={m.id} className={`pp ${on ? 'on' : ''}`} aria-pressed={on} disabled={!editable} onClick={() => toggleCollab(m.id, on)}>
                  <Avatar m={m} size="sm" />{firstName(m.display_name)}</button>;
              })}
              {lists.members.length <= 1 && <span className="muted" style={{ fontSize: 13 }}>Invite people from Team to add them here.</span>}
            </div></dd>
            <dt><label htmlFor="d-due">Due date</label></dt>
            <dd><input id="d-due" className="field-in" type="date" disabled={!editable} value={t.due_date ?? ''} onChange={e => patch({ due_date: e.target.value || null })} /></dd>
            <dt><label htmlFor="d-st">Status</label></dt>
            <dd><select id="d-st" className="field-in" disabled={!editable} value={t.status} onChange={e => patch({ status: e.target.value as Task['status'] })}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></dd>
            <dt><label htmlFor="d-hrs">Time spent</label></dt>
            <dd className="hrs"><input id="d-hrs" className="field-in" type="number" min="0" step="0.25" placeholder="0" disabled={!editable} value={hours}
              onChange={e => setHours(e.target.value)}
              onBlur={() => { if (isNew) return; const h = hoursValue(); if (h !== t.hours) patch({ hours: h }); }} />
              <span className="muted">hours</span></dd>
          </dl>
          {!isNew && <div className="muted" style={{ fontSize: 12 }}>Created {created}{completed && ` · completed ${completed}`}</div>}
        </div>
      </div>
      {editable && (
        <div className="sfoot">
          {err && <span className="err">{err}</span>}
          <span className="grow" />
          {isNew ? <>
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={() => void create()}><Icon name="plus" />{busy ? 'Creating…' : 'Create task'}</button>
          </> : <>
            <span className="muted" style={{ fontSize: 12 }}>Changes save as you go</span>
            <button className="btn primary" onClick={() => void saveAndClose()}><Icon name="check" />Save and close</button>
          </>}
        </div>)}
      {!editable && err && <div className="sfoot"><span className="err">{err}</span></div>}
    </div>
  );
}

function blankTask(ws: string, me: string, d: Partial<Task>): TaskFull {
  return {
    id: '', workspace_id: ws, project_id: null, goal_id: null, title: '', description: '', due_date: null, status: 'todo',
    completed_at: null, hours: null, assignee_member_id: me, created_by_member: me, created_at: new Date().toISOString(),
    ...d, subtasks: [], collaborator_ids: [],
  };
}
