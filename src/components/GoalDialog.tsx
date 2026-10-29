import { useEffect, useState } from 'react';
import { useSolo } from '../lib/solo';
import { useWorkspace } from '../auth/session';
import { deleteGoal, saveGoal, todayISO, type GoalInput } from '../lib/data';
import { GOAL_STATUSES, type Goal, type Member, type Project } from '../lib/types';
import { cleanTag, colorOf, GOAL_COLORS, suggestTag, TAG_MAX } from '../lib/goaltag';
import { GoalTag } from './GoalTag';
import { GOAL_ICONS, SCENES, SceneThumb, sceneOf } from './Scene';
import { Icon } from './Logo';
import { ProjectIcon } from './ProjectChip';

/** New goal / sub-goal (goal = null) or Edit goal. Nothing is saved until Create goal / Save. */
export function GoalDialog({ goal, parentId, goals, members, projects, onClose, onSaved }: {
  goal: Goal | null; parentId?: string | null; goals: Goal[]; members: Member[]; projects: Project[];
  onClose: () => void; onSaved: () => void;
}) {
  const ws = useWorkspace();
  const { solo } = useSolo();
  const [d, setD] = useState<GoalInput>(() => goal
    ? { title: goal.title, short_name: goal.short_name || suggestTag(goal.title), color: goal.color ?? colorOf(goal, goals),
        icon: goal.icon ?? 'target', scene: goal.scene ?? sceneOf(goal, goals), status_auto: goal.status_auto !== false, start_date: goal.start_date, end_date: goal.end_date, status: goal.status, parent_id: goal.parent_id,
        owner_member_id: goal.owner_member_id, manual_progress: goal.manual_progress, notes: goal.notes, project_ids: goal.project_ids }
    : (() => { const y = new Date().getFullYear(); const tops = goals.filter(g => !g.parent_id), used = new Set(tops.map(g => colorOf(g, goals)));
        const scenesUsed = new Set(tops.map(g => sceneOf(g, goals)));
        return { title: '', short_name: '', color: GOAL_COLORS.find(c => !used.has(c)) ?? GOAL_COLORS[tops.length % GOAL_COLORS.length],
          icon: 'target', status_auto: true, scene: (parentId ? null : SCENES.find(([s]) => !scenesUsed.has(s))?.[0] ?? 'hills') as string | null, start_date: todayISO(), end_date: `${y}-12-31`, status: 'on_track' as const, parent_id: parentId ?? null,
        owner_member_id: ws.member_id, manual_progress: 0, notes: '', project_ids: [] }; })());
  // the short name follows the title until someone types their own
  const [tagTouched, setTagTouched] = useState(!!goal?.short_name);
  const [openEnded, setOpenEnded] = useState(goal ? !goal.end_date : false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<GoalInput>) => { setD(cur => ({ ...cur, ...p })); setErr(null); };
  const hasKids = !!goal && goals.some(g => g.parent_id === goal.id);
  const parents = goals.filter(g => !g.parent_id && g.id !== goal?.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    if (!d.title.trim()) { setErr('Give the goal a name.'); return; }
    const tag = cleanTag(d.short_name) || suggestTag(d.title);
    if (!d.start_date) { setErr('Choose a start date.'); return; }
    if (!openEnded && !d.end_date) { setErr('Choose an end date, or tick “No end date”.'); return; }
    if (!openEnded && d.end_date! < d.start_date) { setErr('The end date is before the start date.'); return; }
    setBusy(true);
    try { await saveGoal(ws.workspace_id, goal, { ...d, title: d.title.trim(), short_name: tag, color: d.parent_id ? null : d.color, scene: d.parent_id ? null : d.scene, end_date: openEnded ? null : d.end_date }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  async function remove() {
    if (!goal) return; setBusy(true);
    try { await deleteGoal(goal.id); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  const parentTitle = d.parent_id ? goals.find(g => g.id === d.parent_id)?.title : null;

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={goal ? 'Edit goal' : 'New goal'}>
        <h2>{goal ? 'Edit goal' : parentTitle ? 'New sub-goal' : 'New goal'}</h2>
        <div className="mbody">
          {!goal && parentTitle && <div className="hint">Part of <b>{parentTitle}</b>.</div>}
          <div><label className="lbl" htmlFor="gm-title">Goal</label>
            <input id="gm-title" className="field-in" style={{ width: '100%' }} value={d.title} autoFocus placeholder="e.g. Grow our presence in North Africa"
              onChange={e => set({ title: e.target.value, ...(tagTouched ? {} : { short_name: suggestTag(e.target.value) }) })} onKeyDown={e => { if (e.key === 'Enter') void save(); }} /></div>
          <div className="row2">
            <div><label className="lbl" htmlFor="gm-tag">Short name</label>
              <input id="gm-tag" className="field-in mono" style={{ width: '100%' }} value={d.short_name} maxLength={TAG_MAX} placeholder={suggestTag(d.title || 'Goal')}
                onChange={e => { setTagTouched(true); set({ short_name: cleanTag(e.target.value) }); }} /></div>
            <div><span className="lbl">Colour</span>
              {d.parent_id
                ? <div className="hint" style={{ marginTop: 6 }}>Same as {parentTitle ?? 'its goal'}, so the family reads as one.</div>
                : <div className="swatches gsw">{GOAL_COLORS.map(c => <button key={c} type="button" className={`swt ${d.color?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                    style={{ ['--c' as string]: c }} aria-label={`Colour ${c}`} onClick={() => set({ color: c })} />)}
                  {(() => { const own = !!d.color && !GOAL_COLORS.some(c => c.toLowerCase() === d.color!.toLowerCase());
                    return <label className={`swt custom ${own ? 'on' : ''}`} title="Any colour" style={own ? { background: d.color! } : undefined}>{own ? '' : '+'}
                      <input type="color" value={d.color ?? GOAL_COLORS[0]} onChange={e => set({ color: e.target.value })} aria-label="Pick any colour" /></label>; })()}</div>}</div>
          </div>
          <div className="hint" style={{ marginTop: -6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <GoalTag g={{ id: goal?.id ?? 'new', title: d.title || 'New goal', parent_id: d.parent_id, short_name: cleanTag(d.short_name) || suggestTag(d.title || 'Goal'), color: d.color }}
              goals={[...goals.filter(g => g.id !== goal?.id), { id: goal?.id ?? 'new', title: d.title, parent_id: d.parent_id, short_name: d.short_name, color: d.color }]} />
            Up to {TAG_MAX} characters. This tag stands for the goal in the task list, on projects and in the Lens.</div>
          <div><span className="lbl">Symbol</span><div className="icons">
            {GOAL_ICONS.map(n => <button key={n} type="button" className={d.icon === n ? 'on' : ''} aria-label={n} aria-pressed={d.icon === n} onClick={() => set({ icon: n })}><Icon name={n} /></button>)}</div></div>
          {d.parent_id
            ? <div className="hint">A sub-goal flies over the same landscape as {parentTitle ?? 'its goal'}.</div>
            : <div><span className="lbl">Landscape</span>
              <div className="hint" style={{ margin: '-2px 0 8px' }}>Where the goal flies in the Journey; the weather there shows its status.</div>
              <div className="scenepick">{SCENES.map(([id, label]) => <button key={id} type="button" className={d.scene === id ? 'on' : ''} aria-pressed={d.scene === id}
                onClick={() => set({ scene: id })}><SceneThumb scene={id} />{label}</button>)}</div></div>}
          <div className="row2">
            <div><label className="lbl" htmlFor="gm-start">Start</label>
              <input id="gm-start" type="date" className="field-in" style={{ width: '100%' }} value={d.start_date} onChange={e => set({ start_date: e.target.value })} /></div>
            <div><label className="lbl" htmlFor="gm-end">End</label>
              <input id="gm-end" type="date" className="field-in" style={{ width: '100%' }} value={openEnded ? '' : d.end_date ?? ''} disabled={openEnded} onChange={e => set({ end_date: e.target.value || null })} /></div>
          </div>
          <label className="chk" style={{ marginTop: -6 }}><input type="checkbox" checked={openEnded} onChange={e => { setOpenEnded(e.target.checked); setErr(null); }} />
            No end date. The goal stays open until you mark it achieved.</label>
          {!solo && <div className="row2"><div><label className="lbl" htmlFor="gm-owner">Owner (accountable)</label>
            <select id="gm-owner" className="field-in" style={{ width: '100%' }} value={d.owner_member_id ?? ''} onChange={e => set({ owner_member_id: e.target.value || null })}>
              {members.filter(m => m.access !== 'guest').map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div><div /></div>}
          <div className="row2">
            <div><label className="lbl" htmlFor="gm-status">Status</label>
              <select id="gm-status" className="field-in" style={{ width: '100%' }} value={d.status_auto ? 'auto' : d.status}
                onChange={e => e.target.value === 'auto' ? set({ status_auto: true }) : set({ status_auto: false, status: e.target.value as GoalInput['status'] })}>
                <option value="auto">Automatic{goal && goal.status_auto !== false ? ` (now ${GOAL_STATUSES.find(s => s.id === goal.status)?.label.toLowerCase()})` : ''}</option>
                {GOAL_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label} (set by hand)</option>)}</select>
              <div className="hint" style={{ marginTop: 4 }}>{d.status_auto
                ? (goal?.auto_why && goal.status_auto !== false ? `Now: ${goal.auto_why}.` : 'Worked out from overdue work, activity and (with an end date) the calendar. See Help → Status.')
                : 'Set by hand: it stays as you choose until you change it.'}</div></div>
            {hasKids ? <div /> : <div><label className="lbl" htmlFor="gm-parent">Part of</label>
              <select id="gm-parent" className="field-in" style={{ width: '100%' }} value={d.parent_id ?? ''} onChange={e => set({ parent_id: e.target.value || null })}>
                <option value="">Nothing (top-level goal)</option>{parents.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>}
          </div>
          <div><span className="lbl">Linked projects</span>
            <div className="hint" style={{ margin: '-2px 0 8px' }}>Tasks in these projects count towards the goal’s progress.</div>
            <div className="pplpick">
              {projects.map(p => <button key={p.id} type="button" className={`pp ${d.project_ids.includes(p.id) ? 'on' : ''}`} aria-pressed={d.project_ids.includes(p.id)}
                onClick={() => set({ project_ids: d.project_ids.includes(p.id) ? d.project_ids.filter(x => x !== p.id) : [...d.project_ids, p.id] })}>
                <ProjectIcon p={p} />{p.name}</button>)}
              {projects.length === 0 && <span className="hint">No projects yet. Create them in Projects.</span>}</div></div>
          <div><label className="lbl" htmlFor="gm-manual">Manual progress: <span className="mono">{d.manual_progress}%</span></label>
            <input id="gm-manual" className="range" type="range" min={0} max={100} step={5} value={d.manual_progress} onChange={e => set({ manual_progress: Number(e.target.value) })} />
            <div className="hint">Used only when the goal has no linked projects with tasks, no directly linked tasks and no sub-goals.</div></div>
          <div><label className="lbl" htmlFor="gm-notes">Notes</label>
            <textarea id="gm-notes" className="notes" value={d.notes} onChange={e => set({ notes: e.target.value })} placeholder="Why this goal matters, how you will know it is reached" /></div>
          {confirmDel && <div className="confirm">Delete this goal{hasKids ? ' and its sub-goals' : ''}? Linked tasks and projects stay.<span style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button>
            <button className="btn sm danger" disabled={busy} onClick={() => void remove()}>Delete goal</button></div>}
        </div>
        <div className="mfoot">
          {goal && <button className="btn danger ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" />Delete</button>}
          {err && <span className="err">{err}</span>}<span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : goal ? 'Save' : <><Icon name="plus" />Create goal</>}</button>
        </div>
      </div>
    </div>);
}
