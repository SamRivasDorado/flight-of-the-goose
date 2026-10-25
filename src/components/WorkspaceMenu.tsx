import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../auth/session';
import { db } from '../lib/supabase';
import { useMe } from '../lib/me';
import { useUI } from '../lib/ui';
import { ACCESS_LABEL } from '../lib/types';
import { Avatar, Icon } from './Logo';
import { ProfileDialog } from './ProfileForm';

/** Your picture in the top bar: who you are here, your workspaces, and your profile. */
export function WorkspaceMenu() {
  const { profile, session, workspaces, current, switchWorkspace } = useSession();
  const me = useMe();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | 'profile' | 'new' | 'rename'>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', click); addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', click); removeEventListener('keydown', key); };
  }, [open]);

  if (!profile || !current) return null;
  const who = me ?? { display_name: profile.full_name || '?', color: profile.color ?? '#5B83B5', title: profile.title, avatar_url: profile.avatar_url };
  const go = (id: string) => {
    setOpen(false);
    if (id === current.workspace_id) return;
    ui.openTask(null);
    switchWorkspace(id);
    location.hash = '#/timeline'; // pages of the old workspace do not exist in the new one
  };

  return (
    <div className="wsmenu" ref={box}>
      <button className="mebtn" aria-haspopup="menu" aria-expanded={open} aria-label="You and your workspaces"
        title={`${who.display_name} · ${current.workspace_name}`} onClick={() => setOpen(o => !o)}>
        <Avatar m={who} size="lg" /></button>
      {open && (
        <div className="wspop" role="menu">
          <div className="wshead"><Avatar m={who} size="xl" />
            <div style={{ minWidth: 0 }}><b>{who.display_name}</b>
              <div className="muted" style={{ fontSize: 12 }}>{ACCESS_LABEL[current.access]} in {current.workspace_name}</div>
              <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.user.email}</div></div></div>
          <button className="wsitem" role="menuitem" onClick={() => { setOpen(false); setDialog('profile'); }}><Icon name="edit" />Your profile{workspaces.length > 1 ? ' and name here' : ''}</button>
          <div className="wssep">Workspaces</div>
          {workspaces.map(w => (
            <button key={w.workspace_id} className={`wsitem ${w.workspace_id === current.workspace_id ? 'on' : ''}`} role="menuitemradio"
              aria-checked={w.workspace_id === current.workspace_id} onClick={() => go(w.workspace_id)}>
              <span className="wscheck">{w.workspace_id === current.workspace_id && <Icon name="check" />}</span>
              <span className="tn">{w.workspace_name}</span><span className="tag">{ACCESS_LABEL[w.access]}</span></button>))}
          <button className="wsitem" role="menuitem" onClick={() => { setOpen(false); setDialog('new'); }}><Icon name="plus" />New workspace</button>
          {current.access === 'admin' && <button className="wsitem" role="menuitem" onClick={() => { setOpen(false); setDialog('rename'); }}><Icon name="gear" />Rename this workspace</button>}
        </div>)}
      {dialog === 'profile' && <ProfileDialog onClose={() => setDialog(null)} onSaved={() => { setDialog(null); ui.changed(); }} />}
      {(dialog === 'new' || dialog === 'rename') && <NameDialog mode={dialog} onClose={() => setDialog(null)} onDone={id => { setDialog(null); if (id) go(id); }} />}
    </div>);
}

/** New workspace, or rename the current one (admins). */
function NameDialog({ mode, onClose, onDone }: { mode: 'new' | 'rename'; onClose: () => void; onDone: (newId: string | null) => void }) {
  const { current, reloadWorkspaces } = useSession();
  const [name, setName] = useState(mode === 'rename' ? current?.workspace_name ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [onClose]);
  async function submit() {
    const n = name.trim();
    if (!n) { setErr('Give the workspace a name.'); return; }
    setBusy(true); setErr(null);
    try {
      if (mode === 'new') {
        const { data, error } = await db().rpc('create_workspace', { p_name: n });
        if (error) throw new Error(/function .*create_workspace/i.test(error.message) ? 'New workspaces need a one-time database update first.' : error.message);
        await reloadWorkspaces(); onDone(data as string);
      } else {
        const { error } = await db().from('workspaces').update({ name: n }).eq('id', current!.workspace_id).select('id').single();
        if (error) throw new Error(error.message);
        await reloadWorkspaces(); onDone(null);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return createPortal(
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={mode === 'new' ? 'New workspace' : 'Rename workspace'} style={{ width: 'min(480px,100%)' }}>
        <h2>{mode === 'new' ? 'New workspace' : 'Rename workspace'}</h2>
        <div className="mbody">
          {mode === 'new' && <div className="hint">A separate space with its own projects, goals, tasks and people, for example one for your company and one for an association. You are its admin, and you can use a different name and picture in it.</div>}
          <div><label className="lbl" htmlFor="ws-name">Name</label>
            <input id="ws-name" className="field-in" style={{ width: '100%' }} value={name} autoFocus maxLength={80} placeholder="e.g. Heritage association"
              onChange={e => { setName(e.target.value); setErr(null); }} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} /></div>
        </div>
        <div className="mfoot">{err && <span className="err">{err}</span>}<span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : mode === 'new' ? <><Icon name="plus" />Create workspace</> : <><Icon name="check" />Save</>}</button></div>
      </div>
    </div>, document.body);
}
