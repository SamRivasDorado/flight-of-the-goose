import { useState, type FormEvent } from 'react';
import { useWorkspace } from '../auth/session';
import { inviteMember, listMembers, useLoad } from '../lib/data';
import { ACCESS_LABEL, type Access } from '../lib/types';
import { PERSON_COLORS } from '../config';
import { Avatar, Icon } from '../components/Logo';

export function Team() {
  const ws = useWorkspace();
  const isAdmin = ws.access === 'admin';
  const { data: members, error, reload } = useLoad(() => listMembers(ws.workspace_id), [ws.workspace_id]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', display_name: '', title: '', access: 'member' as Access });
  const [msg, setMsg] = useState<string | null>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setMsg('Add a valid email address.'); return; }
    if (!f.display_name.trim()) { setMsg('Add a name.'); return; }
    try {
      await inviteMember(ws.workspace_id, ws.member_id, { ...f, email: f.email.trim(), display_name: f.display_name.trim(), color: PERSON_COLORS[(members?.length ?? 0) % PERSON_COLORS.length] });
      setMsg(`Invited ${f.email.trim()}. They join when they sign in with that address.`); setF({ email: '', display_name: '', title: '', access: 'member' }); setOpen(false); await reload();
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <>
      <div className="ph"><h1>Team</h1>{members && <span className="sub">{members.length} people</span>}<span className="grow" />
        {isAdmin && <button className="btn primary" onClick={() => setOpen(o => !o)}><Icon name="plus" />Invite a person</button>}</div>
      {msg && <div className="note">{msg}</div>}
      {open && (
        <form className="panel" onSubmit={invite} style={{ marginBottom: 16 }}>
          <div><label className="lbl" htmlFor="ie">Email</label><input id="ie" type="email" className="field-in" style={{ width: '100%' }} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoFocus /></div>
          <div className="row">
            <div style={{ flex: 1 }}><label className="lbl" htmlFor="in">Name</label><input id="in" className="field-in" style={{ width: '100%' }} value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label className="lbl" htmlFor="it">Job title</label><input id="it" className="field-in" style={{ width: '100%' }} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          </div>
          <div><label className="lbl" htmlFor="ia">Access level</label>
            <select id="ia" className="field-in" value={f.access} onChange={e => setF({ ...f, access: e.target.value as Access })}>
              {(Object.keys(ACCESS_LABEL) as Access[]).map(a => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}</select></div>
          <div className="row"><button className="btn primary sm">Send invitation</button><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {error && <div className="err">{error}</div>}
      <div className="pcgrid">{(members ?? []).map(m => (
        <div className="pc" key={m.id}>
          <Avatar m={m} size="xl" />
          <div className="info">
            <b>{m.display_name}{m.id === ws.member_id && <span className="tag" style={{ marginLeft: 6 }}>You</span>}
              {m.status === 'invited' && <span className="tag" style={{ marginLeft: 6, color: 'var(--warn)', borderColor: 'var(--warn)' }}>Invited</span>}</b>
            {m.title && <span className="muted">{m.title}</span>}
            <span className="muted" style={{ fontSize: 12 }}>{m.email}</span>
            <span className="acc">{ACCESS_LABEL[m.access]}</span>
          </div>
        </div>))}</div>
    </>
  );
}
