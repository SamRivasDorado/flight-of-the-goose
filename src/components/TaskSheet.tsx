import { useEffect, useState, type KeyboardEvent } from 'react';
import { useWorkspace } from '../auth/session';
import {
  addSubtask, deleteSubtask, deleteTask, getTaskFull, listGoalRefs, listMembers, listProjects,
  setCollaborator, updateSubtask, updateTask, useLoad,
} from '../lib/data';
import { canEdit, STATUSES, type Task, type TaskFull } from '../lib/types';
import { useUI } from '../lib/ui';
import { dueLabel, firstName } from '../lib/format';
import { Avatar, Icon } from './Logo';
import { ProjectChip } from './ProjectChip';

/** The task details panel that slides up from the bottom (as in the prototype). */
export function TaskSheet() {
  const { openTaskId, openTask, changed } = useUI();
  if (!openTaskId) return null;
  return <Sheet key={openTaskId} id={openTaskId} close={() => openTask(null)} changed={changed} />;
}

function Sheet({ id, close, changed }: { id: string; close: () => void; changed: () => void }) {
  const ws = useWorkspace();
  const editable = canEdit(ws.access);
  const { data: lists } = useLoad(async () => {
    const [members, projects, goals] = await Promise.all([listMembers(ws.workspace_id), listProjects(ws.workspace_id), listGoalRefs(ws.workspace_id)]);
    return { members, projects, goals };
  }, [ws.workspace_id]);
  const [t, setT] = useState<TaskFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [subDraft, setSubDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getTaskFull(id).then(x => {
      if (!live) return;
      if (!x) { setMissing(true); return; }
      setT(x); setTitle(x.title); setDesc(x.description); setHours(x.hours == null ? '' : String(x.hours));
    }).catch(e => setErr(String(e?.message ?? e)));
    return () => { live = false; };
  }, [id]);

  async function run(fn: () => Promise<unknown>) {
    try { setErr(null); await fn(); changed(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  const patch = (p: Partial<Task>) => { if (!t) return; const next = { ...t, ...p }; setT(next); return run(() => updateTask(t.id, p)); };

  // A task closed while still completely empty was a "New task" nobody filled in: remove it.
  async function finish() {
    if (t && editable && !title.trim() && !desc.trim() && t.subtasks.length === 0) {
      try { await deleteTask(t.id); changed(); } catch { /* keep it if it cannot be removed */ }
    } else if (t && editable) {
      // save anything still being typed
      const p: Partial<Task> = {};
      if (title !== t.title) p.title = title;
      if (desc !== t.description) p.description = desc;
      if (Object.keys(p).length) await run(() => updateTask(t.id, p));
    }
    close();
  }
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') void finish(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });

  if (missing) return (
    <div className="sheet" role="dialog" aria-label="Task details"><div className="sh"><span>This task no longer exists or is not visible to you.</span><span className="grow" />
      <button className="iconbtn" onClick={close} aria-label="Close"><Icon name="x" /></button></div></div>);
  if (!t || !lists) return (
    <div className="sheet" role="dialog" aria-label="Task details"><div className="sh"><span className="muted">Loading…</span><span className="grow" />
      <button className="iconbtn" onClick={close} aria-label="Close"><Icon name="x" /></button></div></div>);

  const project = lists.projects.find(p => p.id === t.project_id);
  const done = t.status === 'done';
  const subDone = t.subtasks.filter(s => s.done).length;
  const addSub = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !subDraft.trim()) return;
    const text = subDraft.trim(); setSubDraft('');
    await run(async () => { const s = await addSubtask(t.id, text, t.subtasks.length); setT({ ...t, subtasks: [...t.subtasks, s] }); });
  };
  const created = dueLabel(t.created_at.slice(0, 10), true).text, completed = t.completed_at ? dueLabel(t.completed_at, true).text : '';

  return (
    <div className="sheet" role="dialog" aria-label="Task details">
      <div className="sh">
        <button className={`donebtn ${done ? 'on' : ''}`} disabled={!editable} onClick={() => patch({ status: done ? 'todo' : 'done' })}>
          <Icon name="check" />{done ? 'Completed' : 'Mark complete'}</button>
        {project && <ProjectChip p={project} />}
        <span className="grow" />
        {editable && <button className="iconbtn" onClick={() => setConfirmDel(true)} aria-label="Delete task" title="Delete task"><Icon name="trash" /></button>}
        <button className="iconbtn" onClick={() => void finish()} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="sbody">
        <div className="left">
          {confirmDel && (
            <div className="confirm">Delete this task and its subtasks?<span style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button>
              <button className="btn sm danger" onClick={() => run(async () => { await deleteTask(t.id); close(); })}>Delete task</button></div>)}
          {err && <div className="err">{err}</div>}
          <textarea className="d-title" rows={1} placeholder="Task name" aria-label="Task name" value={title} readOnly={!editable}
            autoFocus={!t.title} onChange={e => setTitle(e.target.value)} onBlur={() => title !== t.title && patch({ title })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
          <div>
            <div className="h3">Description</div>
            <textarea className="notes" placeholder="Context, links, decisions" aria-label="Description" style={{ marginTop: 6 }} value={desc} readOnly={!editable}
              onChange={e => setDesc(e.target.value)} onBlur={() => desc !== t.description && patch({ description: desc })} />
          </div>
          <div>
            <div className="h3">Subtasks {t.subtasks.length > 0 && <span className="mono">{subDone}/{t.subtasks.length}</span>}</div>
            <div className="subs" style={{ marginTop: 6 }}>
              {t.subtasks.map(s => (
                <div key={s.id} className={`sub ${s.done ? 'done' : ''}`}>
                  <button className={`circ ${s.done ? 'on' : ''}`} disabled={!editable} aria-label="Toggle subtask"
                    onClick={() => run(async () => { await updateSubtask(s.id, { done: !s.done }); setT({ ...t, subtasks: t.subtasks.map(x => x.id === s.id ? { ...x, done: !x.done } : x) }); })}><Icon name="check" /></button>
                  <span className="t">{s.title}</span>
                  {editable && <button className="iconbtn" aria-label="Remove subtask"
                    onClick={() => run(async () => { await deleteSubtask(s.id); setT({ ...t, subtasks: t.subtasks.filter(x => x.id !== s.id) }); })}><Icon name="x" /></button>}
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
                return <button key={m.id} className={`pp ${on ? 'on' : ''}`} aria-pressed={on} disabled={!editable}
                  onClick={() => run(async () => { await setCollaborator(t.id, m.id, !on); setT({ ...t, collaborator_ids: on ? t.collaborator_ids.filter(x => x !== m.id) : [...t.collaborator_ids, m.id] }); })}>
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
              onBlur={() => { const h = hours === '' ? null : Math.max(0, Number(hours)); if (h !== t.hours && !Number.isNaN(h)) void patch({ hours: h }); }} />
              <span className="muted">hours</span></dd>
          </dl>
          <div className="muted" style={{ fontSize: 12 }}>Created {created}{completed && ` · completed ${completed}`}</div>
        </div>
      </div>
    </div>
  );
}
