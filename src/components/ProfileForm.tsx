import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../auth/session';
import { db } from '../lib/supabase';
import { PERSON_COLORS, APP_NAME } from '../config';
import { Avatar, Icon, Logo } from './Logo';

/** Turns any picture into a 256 × 256 square (centre crop), small enough to load fast. */
async function squareWebp(file: File): Promise<ArrayBuffer> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height), size = 256;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/webp', 0.86));
  if (!blob) throw new Error('This picture could not be read. Try a PNG or JPG.');
  return blob.arrayBuffer();
}

interface Draft { name: string; title: string; color: string; avatar_url: string | null }

/** Name, job title, colour and picture. Used on the welcome screen and in "Your profile". */
function ProfileFields({ d, set, busy, setBusy, setErr }: {
  d: Draft; set: (p: Partial<Draft>) => void; busy: boolean; setBusy: (b: boolean) => void; setErr: (e: string | null) => void;
}) {
  const { session } = useSession();
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File | undefined) {
    if (!f || !session) return;
    if (!/^image\//.test(f.type)) { setErr('Choose a picture file (PNG, JPG or WebP).'); return; }
    setBusy(true); setErr(null);
    try {
      const body = await squareWebp(f);
      const path = `${session.user.id}/${Date.now()}.webp`;
      const { error } = await db().storage.from('avatars').upload(path, body, { contentType: 'image/webp', upsert: false });
      if (error) throw new Error(error.message);
      set({ avatar_url: db().storage.from('avatars').getPublicUrl(path).data.publicUrl });
    } catch (e) { setErr(`The picture could not be uploaded: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  }

  return (
    <>
      <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
        <Avatar m={{ display_name: d.name || '?', color: d.color, title: d.title, avatar_url: d.avatar_url }} size="xl" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="row">
            <label className="btn sm"><Icon name="plus" />{d.avatar_url ? 'Change picture' : 'Add a picture'}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={e => void upload(e.target.files?.[0])} /></label>
            {d.avatar_url && <button type="button" className="btn sm ghost" onClick={() => set({ avatar_url: null })}>Use initials instead</button>}
          </div>
          <span className="hint">{busy ? 'Uploading…' : 'Optional. Without a picture, your initials show on your colour.'}</span>
        </div>
      </div>
      <div className="row2">
        <div><label className="lbl" htmlFor="pf-name">Your name</label>
          <input id="pf-name" className="field-in" style={{ width: '100%' }} value={d.name} autoFocus placeholder="First and last name"
            onChange={e => { set({ name: e.target.value }); setErr(null); }} /></div>
        <div><label className="lbl" htmlFor="pf-title">Job title <span className="muted">· optional</span></label>
          <input id="pf-title" className="field-in" style={{ width: '100%' }} value={d.title} placeholder="e.g. Senior Geoscientist"
            onChange={e => set({ title: e.target.value })} /></div>
      </div>
      <div><span className="lbl">Your colour</span><div className="swatches">
        {PERSON_COLORS.map(c => <button key={c} type="button" className={`swt ${d.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ ['--c' as string]: c }}
          aria-label={`Colour ${c}`} onClick={() => set({ color: c })} />)}</div>
        <div className="hint" style={{ marginTop: 6 }}>Used for your initials and your marks on shared screens.</div></div>
    </>);
}

function useProfileDraft() {
  const { profile, session } = useSession();
  const [d, setD] = useState<Draft>(() => ({
    name: profile?.full_name ?? '', title: profile?.title ?? '',
    color: profile?.color ?? PERSON_COLORS[0], avatar_url: profile?.avatar_url ?? null,
  }));
  // Invited people: start from the name the admin typed rather than the first part of the email.
  useEffect(() => {
    if (!profile || profile.setup_done || !session) return;
    if (profile.full_name !== (session.user.email ?? '').split('@')[0]) return;
    void db().from('workspace_members').select('display_name').eq('user_id', session.user.id).neq('display_name', profile.full_name).limit(1)
      .then(({ data }) => { const n = data?.[0]?.display_name; if (n) setD(cur => (cur.name === profile.full_name ? { ...cur, name: n } : cur)); });
  }, [profile, session]);
  return [d, (p: Partial<Draft>) => setD(cur => ({ ...cur, ...p }))] as const;
}

async function save(d: Draft) {
  const { error } = await db().rpc('save_my_profile', { p_name: d.name.trim(), p_title: d.title.trim(), p_color: d.color, p_avatar_url: d.avatar_url });
  if (error) throw new Error(error.message);
}

/** First sign-in: "Welcome to Goose", before the app opens. */
export function Welcome() {
  const { refreshProfile, signOut } = useSession();
  const [d, set] = useProfileDraft();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (!d.name.trim()) { setErr('Add your name.'); return; }
    setBusy(true);
    try { await save(d); await refreshProfile(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return (
    <div className="auth">
      <form className="authbox" style={{ width: 'min(560px,100%)' }} onSubmit={e => { e.preventDefault(); void go(); }}>
        <div className="row"><Logo variant="plain" size={52} /><h1>Welcome to {APP_NAME}</h1></div>
        <p className="hint" style={{ margin: 0 }}>Tell your teammates who you are. You can change this any time from your picture at the top right.</p>
        <ProfileFields d={d} set={set} busy={busy} setBusy={setBusy} setErr={setErr} />
        {err && <div className="err">{err}</div>}
        <div className="row"><button type="button" className="btn ghost sm" onClick={() => void signOut()}>Sign out</button><span className="grow" />
          <button className="btn primary" disabled={busy}>Continue <Icon name="arrow" /></button></div>
      </form>
    </div>);
}

/** "Your profile", opened from the picture in the top bar. */
export function ProfileDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { refreshProfile, session } = useSession();
  const [d, set] = useProfileDraft();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  async function submit() {
    if (!d.name.trim()) { setErr('Add your name.'); return; }
    setBusy(true);
    try { await save(d); await refreshProfile(); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return createPortal(
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Your profile"><h2>Your profile</h2>
        <div className="mbody">
          <ProfileFields d={d} set={set} busy={busy} setBusy={setBusy} setErr={setErr} />
          <div className="hint">Signed in as {session?.user.email}. Your name, job title, colour and picture are the same in every workspace you belong to.</div>
        </div>
        <div className="mfoot">{err && <span className="err">{err}</span>}<span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={() => void submit()}><Icon name="check" />Save</button></div>
      </div>
    </div>, document.body);
}
