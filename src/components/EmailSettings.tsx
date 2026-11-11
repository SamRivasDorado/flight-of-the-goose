import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../auth/session';
import { useSolo } from '../lib/solo';
import { listInbox, listMembers, listProjects, listTasks } from '../lib/data';
import { EMAILS_NEED_UPDATE, getEmailPrefs, renderEmail, saveEmailPrefs, sendTestEmail, type EmailItem, type EmailPrefs } from '../lib/emails';
import { Icon } from './Logo';

type Flag = 'mentions' | 'comments' | 'assigned' | 'help' | 'due';
const CHOICES: [Flag, string, boolean][] = [   // [field, label, about other people]
  ['mentions', 'Someone mentions me with @', true],
  ['comments', 'Comments on my tasks, and replies where I commented', true],
  ['assigned', 'Someone gives me a task', true],
  ['help', 'Offers of help, and answers to my offers', true],
  ['due', 'My tasks due tomorrow (in the morning)', false],
];

/** "Emails" in Your profile: what Goose emails you about, and how often. Applies straight away. */
export function EmailSetting({ onError }: { onError: (e: string | null) => void }) {
  const { session } = useSession();
  const { solo } = useSolo();
  const uid = session!.user.id;
  const [p, setP] = useState<EmailPrefs | null | undefined>(undefined);   // undefined: loading, null: needs the update
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  useEffect(() => { getEmailPrefs(uid).then(setP, () => setP(null)); }, [uid]);
  // opened from the link in an email: bring this section into view
  useEffect(() => { if (p !== undefined && (window as unknown as { __gooseEmails?: boolean }).__gooseEmails) {
    (window as unknown as { __gooseEmails?: boolean }).__gooseEmails = false;
    document.getElementById('email-settings')?.scrollIntoView({ block: 'start' }); } }, [p]);

  /** Ticks at once; goes back if saving fails. */
  async function change(patch: Partial<EmailPrefs>) {
    if (!p) return;
    const before = p, next = { ...p, ...patch };
    setP(next); setBusy(true); onError(null); setNote(null);
    try { await saveEmailPrefs(uid, next); } catch (e) { setP(before); onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setNote(null); onError(null);
    try { setNote(await sendTestEmail()); } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const off = !p?.enabled;
  return (
    <div id="email-settings" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <span className="lbl">Emails · to {session?.user.email} <span className="muted">· all your workspaces · applies straight away</span></span>
      {p === undefined && <span className="hint">Loading…</span>}
      {p === null && <span className="hint">{EMAILS_NEED_UPDATE}</span>}
      {p && <>
        <label className="chk" style={{ color: 'var(--fg)', fontSize: 14 }}>
          <input type="checkbox" checked={p.enabled} disabled={busy} onChange={e => void change({ enabled: e.target.checked })} />
          Email me about my work in Goose</label>
        <div className="emailopts" aria-disabled={off}>
          {CHOICES.filter(c => !(solo && c[2])).map(([k, label]) =>
            <label key={k} className="chk"><input type="checkbox" checked={p[k]} disabled={busy || off} onChange={e => void change({ [k]: e.target.checked })} />{label}</label>)}
          <div className="kindpick" style={{ marginTop: 6 }}>
            <label className={p.timing === 'soon' ? 'on' : ''}><input type="radio" name="em-timing" checked={p.timing === 'soon'} disabled={busy || off} onChange={() => void change({ timing: 'soon' })} />
              <span><b>As it happens</b>Within a few minutes, grouped into one email.</span></label>
            <label className={p.timing === 'daily' ? 'on' : ''}><input type="radio" name="em-timing" checked={p.timing === 'daily'} disabled={busy || off} onChange={() => void change({ timing: 'daily' })} />
              <span><b>Once a day</b>One email each morning with everything since the last one.</span></label>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn sm" onClick={() => setExample(true)}><Icon name="mail" />See an example</button>
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => void test()}>Send me a test email</button>
        </div>
        {note && <div className="hint" style={{ marginTop: 4 }}>{note}</div>}
      </>}
      {example && p && <EmailExample prefs={p} onClose={() => setExample(false)} />}
    </div>);
}

const SAMPLE: EmailItem[] = [
  { kind: 'mention', actor: 'A colleague', title: 'Draft the client report', project: 'Client study', excerpt: '@you could you check the figures before Friday?' },
  { kind: 'assigned', actor: 'A colleague', title: 'Update the project plan', project: 'Client study' },
  { kind: 'due', title: 'Send the invoice', project: 'Admin' },
];

/** What your next email could look like, built from your latest notifications and tasks due tomorrow. */
function EmailExample({ prefs, onClose }: { prefs: EmailPrefs; onClose: () => void }) {
  const { current, profile } = useSession();
  const { solo } = useSolo();
  const [mail, setMail] = useState<{ subject: string; html: string; real: boolean } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', onKey, true); return () => removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => {
    const ws = current!;
    void (async () => {
      let items: EmailItem[] = [];
      try {
        const [inbox, members, projects, tasks] = await Promise.all([
          solo ? Promise.resolve([]) : listInbox(ws.workspace_id, ws.member_id), listMembers(ws.workspace_id), listProjects(ws.workspace_id), listTasks(ws.workspace_id)]);
        const pname = (id: string | null | undefined) => projects.find(x => x.id === id)?.name ?? '';
        const KIND = { mention: 'mention', yours: 'comment', thread: 'reply', help: 'help', answer: 'answer' } as const;
        items = inbox.slice(0, 5).map(i => ({
          kind: KIND[i.why], actor: members.find(m => m.id === i.c.author_member_id)?.display_name, title: i.title,
          where: i.c.note_id ? 'note' : 'task', project: pname(i.projectId), excerpt: i.why === 'answer' ? i.offer?.status : i.c.body,
        }) as EmailItem);
        const d = new Date(); d.setDate(d.getDate() + 1);
        const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        items.push(...tasks.filter(t => t.assignee_member_id === ws.member_id && t.status !== 'done' && t.due_date === tomorrow).slice(0, 3)
          .map(t => ({ kind: 'due', title: t.title, project: pname(t.project_id) }) as EmailItem));
        const wanted = (k: EmailItem['kind']) => k === 'mention' ? prefs.mentions : k === 'comment' || k === 'reply' ? prefs.comments
          : k === 'assigned' ? prefs.assigned : k === 'help' || k === 'answer' ? prefs.help : prefs.due;
        items = items.filter(i => wanted(i.kind));
      } catch { items = []; }
      const real = items.length > 0;
      const shown = real ? items : SAMPLE.filter(i => !(solo && i.kind !== 'due'));
      setMail({ ...renderEmail(shown, profile?.full_name ?? ''), real });
    })();
  }, [current, profile, prefs, solo]);
  return createPortal(
    <div className="scrim" style={{ zIndex: 80 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Example email" style={{ width: 'min(680px,100%)' }}><h2>Example email</h2>
        <div className="mbody">
          {!mail ? <span className="hint">Putting it together…</span> : <>
            <div className="hint">{mail.real
              ? 'Built from your latest notifications and your tasks due tomorrow, with the emails you chose.'
              : 'Nothing to show from your own work yet, so this uses made-up tasks.'} Sent from noreply@flightofthegoose.com.</div>
            <div className="emailsubj"><span className="muted">Subject</span> {mail.subject}</div>
            <div className="emailshot" dangerouslySetInnerHTML={{ __html: mail.html }} />
          </>}
        </div>
        <div className="mfoot"><span className="grow" /><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>, document.body);
}
