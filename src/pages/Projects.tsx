import { useState, type FormEvent } from 'react';
import { useWorkspace } from '../auth/session';
import { useUI } from '../lib/ui';
import { createProject, listMembers, listProjects, listTasks, useLoad } from '../lib/data';
import { canManage } from '../lib/types';
import { PROJECT_COLORS } from '../config';
import { Avatar, Icon } from '../components/Logo';

export function Projects() {
  const ws = useWorkspace();
  const ui = useUI();
  const { data, error, reload } = useLoad(async () => {
    const [projects, tasks, members] = await Promise.all([listProjects(ws.workspace_id), listTasks(ws.workspace_id), listMembers(ws.workspace_id)]);
    return { projects, tasks, members };
  }, [ws.workspace_id, ui.version]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [kind, setKind] = useState<'fixed' | 'ongoing'>('ongoing');
  const [formErr, setFormErr] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setFormErr('Give the project a name.'); return; }
    try { await createProject(ws.workspace_id, ws.member_id, { name: name.trim(), color, kind }); setName(''); setAdding(false); setFormErr(null); await reload(); }
    catch (err) { setFormErr(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <>
      <div className="ph"><h1>Projects</h1>{data && <span className="sub">{data.projects.length} visible to you</span>}<span className="grow" />
        {canManage(ws.access) && <button className="btn primary" onClick={() => setAdding(a => !a)}><Icon name="plus" />New project</button>}</div>
      {adding && (
        <form className="panel" onSubmit={add} style={{ marginBottom: 16 }}>
          <div><label className="lbl" htmlFor="pn">Name</label><input id="pn" className="field-in" style={{ width: '100%' }} value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
          <div className="row">{PROJECT_COLORS.map(c => (
            <button type="button" key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)}
                    style={{ width: 26, height: 26, borderRadius: 7, background: c, outline: c === color ? '2px solid var(--fg)' : 'none', outlineOffset: 2 }} />))}</div>
          <div className="row"><label className="row"><input type="radio" checked={kind === 'ongoing'} onChange={() => setKind('ongoing')} />Ongoing</label>
            <label className="row"><input type="radio" checked={kind === 'fixed'} onChange={() => setKind('fixed')} />Fixed term</label></div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="row"><button className="btn primary sm">Create project</button><button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}
      {error && <div className="err">{error}</div>}
      {data && (data.projects.length === 0
        ? <div className="empty">{canManage(ws.access) ? 'No projects yet. Create the first one.' : 'You are not part of any project yet.'}</div>
        : <div className="wall">{data.projects.map(p => {
            const ts = data.tasks.filter(t => t.project_id === p.id), open = ts.filter(t => t.status !== 'done');
            const owner = data.members.find(m => m.id === p.owner_member_id);
            return (
              <div className="pcard" key={p.id} style={{ ['--c' as string]: p.color }}>
                <div className="top"><span className="picon" style={{ ['--c' as string]: p.color }} /><b>{p.name}</b><span className="tag">{p.kind === 'fixed' ? 'Fixed term' : 'Ongoing'}</span></div>
                <div className="body">
                  <span>{open.length} open · {ts.length - open.length} done</span>
                  {owner && <span className="who"><Avatar m={owner} size="sm" />{owner.display_name}<span className="muted">owner</span></span>}
                </div>
              </div>);
          })}</div>)}
    </>
  );
}
