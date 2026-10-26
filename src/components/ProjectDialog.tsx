import { useEffect, useState } from 'react';
import { useSolo } from '../lib/solo';
import { useWorkspace } from '../auth/session';
import { deleteProject, listGoalRefs, listMembers, listTeamRefs, saveProject, setProjectDefault, setProjectImage, todayISO, useLoad, type ProjectInput } from '../lib/data';
import { useLens } from '../lib/lens';
import { removeImage, uploadImage } from '../lib/images';
import { ImagePicker, NO_PICK, useRevoke, type PickedImage } from './ImagePicker';
import { ProjectIcon } from './ProjectChip';
import { canManage, type ProjectFull } from '../lib/types';
import { PROJECT_COLORS } from '../config';
import { Avatar, Icon, PROJECT_ICONS } from './Logo';

/** New project (project = null) or project settings, as in the prototype. Nothing is saved until Create project / Save. */
export function ProjectDialog({ project, kind, count, onClose, onSaved, onDeleted }: {
  project: ProjectFull | null;
  kind?: 'fixed' | 'ongoing';
  /** How many projects exist, to pick the next colour for a new one. */
  count: number;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
}) {
  const ws = useWorkspace();
  const { data: lists } = useLoad(async () => {
    const [members, goals, teams] = await Promise.all([listMembers(ws.workspace_id), listGoalRefs(ws.workspace_id), listTeamRefs(ws.workspace_id)]);
    return { members, goals, teams };
  }, [ws.workspace_id]);
  const [d, setD] = useState<ProjectInput>(() => project ? {
    name: project.name, color: project.color, icon: project.icon, kind: project.kind, status: project.status,
    start_date: project.start_date, end_date: project.end_date, owner_member_id: project.owner_member_id,
    member_ids: project.member_ids, team_ids: project.team_ids, goal_ids: project.goal_ids,
  } : (() => {
    const k = kind ?? 'ongoing', end = new Date(); end.setDate(end.getDate() + 90);
    return { name: '', color: PROJECT_COLORS[count % PROJECT_COLORS.length], icon: 'folder', kind: k, status: 'active' as const,
      start_date: todayISO(), end_date: k === 'fixed' ? todayISO(end) : null, owner_member_id: ws.member_id, member_ids: [], team_ids: [], goal_ids: [] };
  })());
  const [busy, setBusy] = useState(false);
  const lens = useLens();
  const { solo } = useSolo();
  const [defs, setDefs] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(lens.dims.map(dm => [dm.id, project ? lens.projectDefault(project.id, dm.id) : null])));
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [img, setImg] = useState<PickedImage>(NO_PICK);
  const [fit, setFit] = useState<'fit' | 'fill'>(project?.image_fit ?? 'fit');
  useRevoke(img);
  /** Set once a new project exists, so pressing the button again (after an image error) saves instead of creating a second one. */
  const [created, setCreated] = useState<ProjectFull | null>(null);
  const base = project ?? created;
  const hasImage = !!img.blob || (!!base?.image_path && !img.cleared);
  const set = (p: Partial<ProjectInput>) => setD(cur => ({ ...cur, ...p }));
  const toggle = (k: 'member_ids' | 'team_ids' | 'goal_ids', v: string) =>
    setD(cur => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter(x => x !== v) : [...cur[k], v] }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    if (!d.name.trim()) { setErr('Give the project a name.'); return; }
    if (d.kind === 'fixed' && d.start_date && d.end_date && d.end_date < d.start_date) { setErr('The end date is before the start date.'); return; }
    setBusy(true); setErr(null);
    try {
      const row = { ...d, name: d.name.trim(), end_date: d.kind === 'fixed' ? d.end_date : null };
      const id = await saveProject(ws.workspace_id, base, row);
      if (!base) setCreated({ ...(row as unknown as ProjectFull), id, image_path: null, image_fit: 'fit', member_ids: row.member_ids.filter(x => x !== row.owner_member_id) });
      for (const [f, o] of Object.entries(defs)) if ((base ? lens.projectDefault(base.id, f) : null) !== o) await setProjectDefault(id, f, o);
      // the image goes last: the project must exist before its picture can be stored
      if (img.blob) {
        const path = await uploadImage(ws.workspace_id, 'projects', id, img.blob);
        await setProjectImage(id, path, fit);
        void removeImage(base?.image_path);
      } else if (img.cleared && base?.image_path) {
        await setProjectImage(id, null, fit); void removeImage(base.image_path);
      } else if (base?.image_path && fit !== base.image_fit) await setProjectImage(id, base.image_path, fit);
      onSaved(id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  async function remove() {
    if (!project) return;
    setBusy(true);
    try { await deleteProject(project.id); onDeleted?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const statusSel = (
    <select id="pm-status" className="field-in" style={{ width: '100%' }} value={d.status} onChange={e => set({ status: e.target.value as ProjectInput['status'] })}>
      <option value="active">Active</option><option value="paused">Paused</option><option value="closed">Done</option></select>);
  const hint = (t: string) => <div className="hint" style={{ margin: '-2px 0 8px' }}>{t}</div>;

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={project ? 'Project settings' : 'New project'}>
        <h2>{project ? 'Project settings' : 'New project'}</h2>
        <div className="mbody">
          <div><label className="lbl" htmlFor="pm-name">Name</label>
            <input id="pm-name" className="field-in" style={{ width: '100%' }} value={d.name} autoFocus placeholder="e.g. Client X reservoir model"
              onChange={e => { set({ name: e.target.value }); setErr(null); }} onKeyDown={e => { if (e.key === 'Enter') void save(); }} /></div>
          <div><span className="lbl">Kind</span><div className="kindpick">
            <label className={d.kind === 'fixed' ? 'on' : ''}><input type="radio" name="pkind" checked={d.kind === 'fixed'}
              onChange={() => { const end = new Date(); end.setDate(end.getDate() + 90); set({ kind: 'fixed', end_date: d.end_date ?? todayISO(end) }); }} />
              <span><b>Fixed term</b>Has a start and an end date. Shows % done against time elapsed.</span></label>
            <label className={d.kind !== 'fixed' ? 'on' : ''}><input type="radio" name="pkind" checked={d.kind !== 'fixed'} onChange={() => set({ kind: 'ongoing' })} />
              <span><b>Ongoing</b>Support, internal work, anything without an end. Shows activity instead of % done.</span></label>
          </div></div>
          <div className="row2">
            <div><label className="lbl" htmlFor="pm-start">Start</label>
              <input id="pm-start" type="date" className="field-in" style={{ width: '100%' }} value={d.start_date ?? ''} onChange={e => set({ start_date: e.target.value || null })} /></div>
            {d.kind === 'fixed'
              ? <div><label className="lbl" htmlFor="pm-end">End</label>
                  <input id="pm-end" type="date" className="field-in" style={{ width: '100%' }} value={d.end_date ?? ''} onChange={e => set({ end_date: e.target.value || null })} /></div>
              : <div><label className="lbl" htmlFor="pm-status">Status</label>{statusSel}</div>}
          </div>
          {d.kind === 'fixed' && <div className="row2"><div><label className="lbl" htmlFor="pm-status">Status</label>{statusSel}</div><div /></div>}
          {!solo && <><div className="row2"><div><label className="lbl" htmlFor="pm-owner">Owner (project manager)</label>
            <select id="pm-owner" className="field-in" style={{ width: '100%' }} value={d.owner_member_id ?? ''} onChange={e => set({ owner_member_id: e.target.value || null })}>
              {(lists?.members ?? []).filter(m => m.access !== 'guest').map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div><div /></div>
          <div><span className="lbl">Members</span>
            {hint('Members see the whole project: all its tasks and its notebook. Guests can look but not change anything.')}
            <div className="pplpick">
              {(lists?.members ?? []).filter(m => m.id !== d.owner_member_id).map(m => (
                <button key={m.id} type="button" className={`pp ${d.member_ids.includes(m.id) ? 'on' : ''}`} aria-pressed={d.member_ids.includes(m.id)} onClick={() => toggle('member_ids', m.id)}>
                  <Avatar m={m} size="sm" />{m.display_name}{m.access === 'guest' && <span className="muted"> (guest)</span>}</button>))}
              {lists && lists.members.filter(m => m.id !== d.owner_member_id).length === 0 && <span className="hint">No one else in the workspace yet. Invite people from the Team tab.</span>}
            </div></div></>}
          <div><span className="lbl">Part of goals <span className="muted">· optional</span></span>
            {hint('Tick the goals this project supports. Leave all unticked if it stands on its own.')}
            <div className="pplpick">
              {(lists?.goals ?? []).filter(g => !g.parent_id).flatMap(g => [g, ...(lists?.goals ?? []).filter(k => k.parent_id === g.id)]).map(g => (
                <button key={g.id} type="button" className={`pp ${d.goal_ids.includes(g.id) ? 'on' : ''}`} aria-pressed={d.goal_ids.includes(g.id)} onClick={() => toggle('goal_ids', g.id)}>
                  <Icon name="target" />{g.parent_id ? '↳ ' : ''}{g.title}</button>))}
              {lists && lists.goals.length === 0 && <span className="hint">No goals yet. They will be created in Strategy.</span>}
            </div></div>
          {!solo && <div><span className="lbl">Shared with teams</span>
            {hint('Everyone in a team you tick becomes a member, including people who join the team later.')}
            <div className="pplpick">
              {(lists?.teams ?? []).map(t => (
                <button key={t.id} type="button" className={`pp ${d.team_ids.includes(t.id) ? 'on' : ''}`} aria-pressed={d.team_ids.includes(t.id)} onClick={() => toggle('team_ids', t.id)}>
                  <i className="dot" style={{ ['--c' as string]: t.color }} />{t.name}</button>))}
              {lists && lists.teams.length === 0 && <span className="hint">No teams yet. They will be created in the Team tab.</span>}
            </div></div>}
          {lens.dims.length > 0 && <div><span className="lbl">Default dimensions</span>
            {hint('Tasks in this project inherit these values unless a task sets its own.')}
            <div className="row2">{lens.dims.map(dm => (
              <div key={dm.id}><label className="hint" htmlFor={`pd-${dm.id}`} style={{ display: 'block', marginBottom: 4 }}>{dm.name}</label>
                <select id={`pd-${dm.id}`} className="field-in" style={{ width: '100%' }} value={defs[dm.id] ?? ''} onChange={e => setDefs({ ...defs, [dm.id]: e.target.value || null })}>
                  <option value="">—</option>{dm.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>))}</div></div>}
          <div><span className="lbl">Colour</span><div className="swatches">
            {PROJECT_COLORS.map(c => <button key={c} type="button" className={`swt ${d.color === c ? 'on' : ''}`} style={{ ['--c' as string]: c }} aria-label={`Colour ${c}`} onClick={() => set({ color: c })} />)}
            <label className="swt custom" title="Any colour" style={{ position: 'relative' }}>+<input type="color" value={d.color} onChange={e => set({ color: e.target.value })} aria-label="Pick any colour" /></label>
          </div></div>
          <div><span className="lbl">Symbol</span><div className="icons">
            {PROJECT_ICONS.map(n => <button key={n} type="button" className={d.icon === n ? 'on' : ''} aria-label={n} onClick={() => set({ icon: n })}
              style={d.icon === n ? { color: d.color } : undefined}><Icon name={n} /></button>)}
          </div>
            <div style={{ marginTop: 10 }}>
              <ImagePicker hasImage={hasImage} onError={setErr}
                preview={<ProjectIcon p={{ ...d, image_fit: fit, image_path: img.cleared ? null : base?.image_path }} size="lg" src={img.blob ? img.preview : undefined} />}
                onPick={setImg} onClear={() => setImg({ ...NO_PICK, cleared: true })}
                extra={hasImage && <span className="seg" role="group" aria-label="How the image fits">
                  <button type="button" className={fit === 'fit' ? 'on' : ''} onClick={() => setFit('fit')}>Show whole image</button>
                  <button type="button" className={fit === 'fill' ? 'on' : ''} onClick={() => setFit('fill')}>Fill the square</button></span>}
                hint={hasImage ? 'The image replaces the symbol everywhere the project appears.' : 'A logo or photo instead of a symbol: PNG, JPG, GIF, WebP, SVG and more. The whole image is kept.'} />
            </div></div>
          {confirmDel && (
            <div className="confirm">Delete this project? Its tasks stay, without a project. Its notebook entries are deleted.<span style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button>
              <button className="btn sm danger" disabled={busy} onClick={() => void remove()}>Delete project</button></div>)}
        </div>
        <div className="mfoot">
          {project && canManage(ws.access) && <button className="btn danger ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" />Delete</button>}
          {err && <span className="err">{err}</span>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : base ? 'Save' : <><Icon name="plus" />Create project</>}</button>
        </div>
      </div>
    </div>
  );
}
