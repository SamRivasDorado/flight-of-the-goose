import { useEffect, useState, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { deleteTeam, inviteMemberChecked, removeMember, saveTeam, setPersonTeams, updateMember, type TeamInput } from '../lib/data';
import { ACCESS_DESC, ACCESS_LABEL, type Access, type Member, type Team } from '../lib/types';
import { PERSON_COLORS, PROJECT_COLORS } from '../config';
import { Avatar, Icon } from './Logo';

/** Team colours: three extra strong colours plus the project palette (as in the prototype). */
export const TEAM_COLORS = ['#D0453A', '#8E5CC2', '#4A7FC1', ...PROJECT_COLORS];

/** A team's square badge: its initials on its colour. */
export function TeamAvatar({ t, size = '' }: { t: Pick<Team, 'name' | 'color'>; size?: '' | 'xs' | 'sm' | 'lg' | 'xl' }) {
  const initials = (t.name || 'T').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <span className={`tav ${size}`} style={{ ['--c' as string]: t.color }}>{initials}</span>;
}

function Modal({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title}><h2>{title}</h2>
        <div className="mbody">{children}</div><div className="mfoot">{foot}</div></div>
    </div>);
}

/* ---------- New team / Team settings ---------- */

export function TeamDialog({ team, members, count, canDelete, onClose, onSaved }: {
  team: Team | null; members: Member[]; count: number; canDelete: boolean; onClose: () => void; onSaved: (id: string | null) => void;
}) {
  const ws = useWorkspace();
  const [d, setD] = useState<TeamInput>(() => team
    ? { name: team.name, color: team.color, lead_member_id: team.lead_member_id, member_ids: team.member_ids }
    // a manager who creates a team leads it, so they can also manage its members
    : { name: '', color: TEAM_COLORS[count % TEAM_COLORS.length], lead_member_id: ws.access === 'admin' ? null : ws.member_id, member_ids: ws.access === 'admin' ? [] : [ws.member_id] });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<TeamInput>) => { setD(cur => ({ ...cur, ...p })); setErr(null); };
  const toggle = (id: string) => setD(cur => {
    const on = cur.member_ids.includes(id);
    return { ...cur, member_ids: on ? cur.member_ids.filter(x => x !== id) : [...cur.member_ids, id], lead_member_id: on && cur.lead_member_id === id ? null : cur.lead_member_id };
  });

  async function save() {
    if (!d.name.trim()) { setErr('Give the team a name.'); return; }
    setBusy(true);
    try { onSaved(await saveTeam(ws.workspace_id, team, { ...d, name: d.name.trim() })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  async function remove() {
    if (!team) return; setBusy(true);
    try { await deleteTeam(team.id); onSaved(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <Modal title={team ? 'Team settings' : 'New team'} onClose={onClose} foot={<>
      {team && canDelete && <button className="btn danger ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" />Delete</button>}
      {err && <span className="err">{err}</span>}<span className="grow" />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : team ? 'Save' : <><Icon name="plus" />Create team</>}</button></>}>
      <div><label className="lbl" htmlFor="te-name">Name</label>
        <input id="te-name" className="field-in" style={{ width: '100%' }} value={d.name} autoFocus placeholder="e.g. Reservoir modelling"
          onChange={e => set({ name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') void save(); }} /></div>
      <div><span className="lbl">Members</span><div className="pplpick">
        {members.map(m => <button key={m.id} type="button" className={`pp ${d.member_ids.includes(m.id) ? 'on' : ''}`} aria-pressed={d.member_ids.includes(m.id)} onClick={() => toggle(m.id)}>
          <Avatar m={m} size="sm" />{m.display_name}</button>)}</div></div>
      <div className="row2"><div><label className="lbl" htmlFor="te-lead">Lead</label>
        <select id="te-lead" className="field-in" style={{ width: '100%' }} value={d.lead_member_id ?? ''} onChange={e => set({ lead_member_id: e.target.value || null })}>
          <option value="">No lead</option>{members.filter(m => d.member_ids.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select>
        <div className="hint" style={{ marginTop: 4 }}>The lead can change the team’s members and settings.</div></div><div /></div>
      <div><span className="lbl">Colour</span><div className="swatches">
        {TEAM_COLORS.map(c => <button key={c} type="button" className={`swt ${d.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ ['--c' as string]: c }} aria-label={`Colour ${c}`} onClick={() => set({ color: c })} />)}
        <label className="swt custom" title="Any colour" style={{ position: 'relative' }}>+<input type="color" value={d.color} onChange={e => set({ color: e.target.value })} aria-label="Pick any colour" /></label>
      </div></div>
      <div><span className="lbl">Badge</span><div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><TeamAvatar t={{ name: d.name || 'Team', color: d.color }} size="lg" />
        <span className="hint">The team shows its initials on its colour. Uploading your own image comes later, with profile pictures.</span></div></div>
      {confirmDel && <div className="confirm">Delete this team? People stay; projects shared with it lose those members unless they are added directly.<span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button>
        <button className="btn sm danger" disabled={busy} onClick={() => void remove()}>Delete team</button></div>}
    </Modal>);
}

/* ---------- Invite a person / Edit person ---------- */

export function PersonDialog({ person, teams, count, onClose, onSaved }: {
  person: Member | null; teams: Team[]; count: number; onClose: () => void; onSaved: (msg?: string) => void;
}) {
  const ws = useWorkspace();
  const self = person?.id === ws.member_id;
  const [d, setD] = useState({ email: person?.email ?? '', display_name: person?.display_name ?? '', title: person?.title ?? '', access: (person?.access ?? 'member') as Access,
    team_ids: person ? teams.filter(t => t.member_ids.includes(person.id)).map(t => t.id) : [] as string[] });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<typeof d>) => { setD(cur => ({ ...cur, ...p })); setErr(null); };

  async function save() {
    const email = d.email.trim().toLowerCase();
    if (!person && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('Add a valid email address.'); return; }
    if (!d.display_name.trim()) { setErr('Add a name.'); return; }
    setBusy(true);
    try {
      let id = person?.id;
      if (person) await updateMember(person.id, { display_name: d.display_name.trim(), title: d.title.trim(), ...(self ? {} : { access: d.access }) });
      else id = (await inviteMemberChecked(ws.workspace_id, ws.member_id, { email, display_name: d.display_name.trim(), title: d.title.trim(), access: d.access, color: PERSON_COLORS[count % PERSON_COLORS.length] })).id;
      await setPersonTeams(id!, teams, d.team_ids);
      onSaved(person ? undefined : `Invited ${email}. They join this workspace when they sign in to Goose with that address. (Invitation emails come later.)`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  async function remove() {
    if (!person) return; setBusy(true);
    try { await removeMember(ws.workspace_id, person.id, ws.member_id); onSaved(`${person.display_name} was removed. Projects they owned are now yours; their tasks are unassigned.`); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <Modal title={person ? 'Edit person' : 'Invite a person'} onClose={onClose} foot={<>
      {person && !self && <button className="btn danger ghost" onClick={() => setConfirmDel(true)}><Icon name="trash" />Remove</button>}
      {err && <span className="err">{err}</span>}<span className="grow" />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : person ? 'Save' : <><Icon name="plus" />Invite</>}</button></>}>
      {!person && <div className="hint">The person joins this workspace with the access level you choose as soon as they sign in to Goose with this email address. We email them the invitation when you click Invite.</div>}
      <div className="row2"><div><label className="lbl" htmlFor="pe-email">Email</label>
        <input id="pe-email" type="email" className="field-in" style={{ width: '100%' }} value={d.email} disabled={!!person} placeholder="name@company.com" autoFocus={!person}
          onChange={e => set({ email: e.target.value })} /></div><div /></div>
      <div className="row2">
        <div><label className="lbl" htmlFor="pe-name">Name</label><input id="pe-name" className="field-in" style={{ width: '100%' }} value={d.display_name} placeholder="First and last name"
          onChange={e => set({ display_name: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="pe-title">Job title</label><input id="pe-title" className="field-in" style={{ width: '100%' }} value={d.title} placeholder="e.g. Reservoir Engineer"
          onChange={e => set({ title: e.target.value })} /></div></div>
      <div><span className="lbl">Access level</span><div className="kindpick">
        {(Object.keys(ACCESS_LABEL) as Access[]).map(a => (
          <label key={a} className={d.access === a ? 'on' : ''}><input type="radio" name="pe-acc" checked={d.access === a} disabled={self} onChange={() => set({ access: a })} />
            <span><b>{ACCESS_LABEL[a]}</b>{ACCESS_DESC[a]}</span></label>))}</div>
        {self && <div className="hint" style={{ marginTop: 4 }}>Your own access level cannot be changed here.</div>}</div>
      <div><span className="lbl">Teams</span><div className="pplpick">
        {teams.map(t => <button key={t.id} type="button" className={`pp ${d.team_ids.includes(t.id) ? 'on' : ''}`} aria-pressed={d.team_ids.includes(t.id)}
          onClick={() => set({ team_ids: d.team_ids.includes(t.id) ? d.team_ids.filter(x => x !== t.id) : [...d.team_ids, t.id] })}>
          <i className="dot" style={{ ['--c' as string]: t.color }} />{t.name}</button>)}
        {teams.length === 0 && <span className="hint">No teams yet. Create one with New team.</span>}</div></div>
      {confirmDel && person && <div className="confirm">Remove {person.display_name}? Their tasks become unassigned and the projects they own pass to you.<span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button>
        <button className="btn sm danger" disabled={busy} onClick={() => void remove()}>Remove person</button></div>}
    </Modal>);
}
