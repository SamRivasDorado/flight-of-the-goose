import { useState, type KeyboardEvent } from 'react';
import { useWorkspace } from '../auth/session';
import { createTask, listMembers, listProjects, listTasks, updateTask, useLoad } from '../lib/data';
import { canEdit, type Task } from '../lib/types';
import { Icon } from '../components/Logo';

export function Tasks() {
  const ws = useWorkspace();
  const editable = canEdit(ws.access);
  const { data, error, reload } = useLoad(async () => {
    const [tasks, projects, members] = await Promise.all([listTasks(ws.workspace_id), listProjects(ws.workspace_id), listMembers(ws.workspace_id)]);
    return { tasks, projects, members };
  }, [ws.workspace_id]);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function save(id: string, patch: Partial<Task>) {
    try { await updateTask(id, patch); await reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function quickAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !draft.trim()) return;
    try { await createTask(ws.workspace_id, ws.member_id, { title: draft.trim() }); setDraft(''); await reload(); }
    catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
  }

  const tasks = data?.tasks ?? [];
  const open = tasks.filter(t => t.status !== 'done');
  return (
    <>
      <div className="ph"><h1>Tasks</h1>{data && <span className="sub">{open.length} open · {tasks.length - open.length} done</span>}</div>
      {(error || msg) && <div className="err" style={{ marginBottom: 10 }}>{error || msg}</div>}
      <div className="tbl-wrap">
        <table className="tl2">
          <thead><tr><th style={{ width: '42%' }}>Name</th><th>Due date</th><th>Assignee</th><th>Project</th><th>Hours</th></tr></thead>
          <tbody>
            {data && tasks.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 20 }}>No tasks yet. Add one below.</td></tr>}
            {tasks.map(t => (
              <tr key={t.id} className={t.status === 'done' ? 'done' : ''}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className={`circ ${t.status === 'done' ? 'on' : ''}`} disabled={!editable}
                          aria-label={t.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
                          onClick={() => save(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}><Icon name="check" /></button>
                  <input className="cellin ttl" defaultValue={t.title} disabled={!editable} aria-label="Task name"
                         onBlur={e => e.target.value !== t.title && save(t.id, { title: e.target.value })} /></div></td>
                <td><input className="cellin" type="date" defaultValue={t.due_date ?? ''} disabled={!editable} aria-label="Due date"
                           onChange={e => save(t.id, { due_date: e.target.value || null })} /></td>
                <td><select className="cellin" value={t.assignee_member_id ?? ''} disabled={!editable} aria-label="Assignee"
                            onChange={e => save(t.id, { assignee_member_id: e.target.value || null })}>
                  <option value="">Nobody</option>{data!.members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></td>
                <td><select className="cellin" value={t.project_id ?? ''} disabled={!editable} aria-label="Project"
                            onChange={e => save(t.id, { project_id: e.target.value || null })}>
                  <option value="">No project</option>{data!.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td><input className="cellin" type="number" min={0} step={0.25} style={{ width: 80 }} defaultValue={t.hours ?? ''} disabled={!editable} aria-label="Hours"
                           onBlur={e => save(t.id, { hours: e.target.value === '' ? null : Number(e.target.value) })} /></td>
              </tr>))}
          </tbody>
        </table>
        {editable && <div className="quick"><Icon name="plus" /><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={quickAdd}
                                                                         placeholder="Add a task and press Enter" aria-label="Add a task" /></div>}
      </div>
    </>
  );
}
