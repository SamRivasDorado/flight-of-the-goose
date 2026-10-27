import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../auth/session';
import { answerHelp, getMySettings, listInbox, listMembers, saveMySettings, type InboxItem } from '../lib/data';
import { useUI } from '../lib/ui';
import type { Member } from '../lib/types';
import { Avatar, Icon } from './Logo';
import { CommentBody } from './Comments';

const WHY: Record<InboxItem['why'], string> = { mention: 'mentioned you', yours: 'commented on your task', thread: 'replied', help: 'offered to help with', answer: 'answered your offer of help with' };

/** Opens a notebook entry's comments after going to its project (read by the Notebook). */
export function openNoteComments(projectId: string, noteId: string) {
  try { localStorage.setItem('goose.projectTab', JSON.stringify('notebook')); } catch { /* ignore */ }
  (window as unknown as { __gooseOpenNote?: string }).__gooseOpenNote = noteId;
  if (location.hash === `#/project/${projectId}`) window.dispatchEvent(new Event('goose:open-note'));
  else location.hash = `#/project/${projectId}`;
}

/** The bell in the top bar: comments that mention you, are on your tasks, or reply to you. */
export function Inbox() {
  const ws = useWorkspace();
  const ui = useUI();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [seen, setSeen] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [it, m, s] = await Promise.all([listInbox(ws.workspace_id, ws.member_id), listMembers(ws.workspace_id), getMySettings(ws.member_id).catch(() => ({}))]);
      setItems(it); setMembers(m); setSeen(prev => prev ?? ((s as Record<string, unknown>).inboxSeen as string | undefined) ?? '1970-01-01');
    } catch { /* the bell stays quiet if something fails */ }
  }, [ws.workspace_id, ws.member_id]);
  useEffect(() => { void load(); }, [load, ui.version]);
  useEffect(() => {
    const t = setInterval(() => void load(), 60000);
    const on = () => void load();
    addEventListener('goose:comments', on);
    return () => { clearInterval(t); removeEventListener('goose:comments', on); };
  }, [load]);

  const unread = items.filter(i => seen != null && i.c.created_at > seen).length;
  function close() {
    setOpen(false);
    const now = new Date().toISOString();
    setSeen(now); void saveMySettings(ws.member_id, { inboxSeen: now }).catch(() => undefined);
  }
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => { const b = btn.current?.getBoundingClientRect(), w = pop.current?.offsetWidth ?? 360; if (b) setPos({ left: Math.max(8, Math.min(b.right - w, innerWidth - w - 8)), top: b.bottom + 8 }); };
    place(); addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('mousedown', click); addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', click); removeEventListener('keydown', key); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** Accept or decline an offer of help straight from the bell. */
  async function answer(i: InboxItem, yes: boolean) {
    if (!i.offer) return;
    try { await answerHelp(i.offer, yes); ui.changed(); await load(); } catch { /* the list stays as it was */ }
  }
  function go(i: InboxItem) {
    close();
    if (i.c.task_id) ui.openTask(i.c.task_id);
    else if (i.c.note_id && i.projectId) openNoteComments(i.projectId, i.c.note_id);
  }

  return (
    <>
      <button ref={btn} className="iconbtn bellbtn" aria-label={unread ? `For you: ${unread} new` : 'For you'} title="For you: comments, mentions and offers of help"
        aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="bell" />{unread > 0 && <span className="bellcount">{unread > 9 ? '9+' : unread}</span>}</button>
      {open && createPortal(
        <div ref={pop} className="inbox" role="dialog" aria-label="For you" style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}>
          <div className="inboxh"><b>For you</b><span className="muted">last 30 days</span></div>
          {items.length === 0 && <div className="hint" style={{ padding: '10px 14px' }}>Nothing yet. When someone mentions you with @, comments on your tasks, replies to you, or offers to help, it shows here.</div>}
          <div className="inboxlist">
            {items.slice(0, 40).map(i => {
              const a = members.find(m => m.id === i.c.author_member_id);
              const isNew = seen != null && i.c.created_at > seen;
              return (
                <div key={i.c.id} role="button" tabIndex={0} className={`inboxitem ${isNew ? 'new' : ''} ${i.offer ? 'helpitem' : ''}`} onClick={() => go(i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i); } }}>
                  <Avatar m={a} size="sm" />
                  <span className="ii">
                    {i.why === 'answer' && i.offer
                      ? <span className="iw"><b>{a?.display_name ?? 'Someone'}</b> {i.offer.status === 'accepted' ? 'accepted your offer to help with' : 'said no thanks to your offer to help with'} <b>{i.title}</b></span>
                      : <span className="iw"><b>{a?.display_name ?? 'Someone'}</b> {WHY[i.why]}{i.c.task_id ? (i.why === 'yours' || i.why === 'help' ? ' ' : ' on ') : ' in the notebook: '}<b>{i.title}</b></span>}
                    {i.c.body && <span className="ib"><CommentBody c={i.c} members={members} /></span>}
                    {i.why === 'help' && i.offer && (
                      <span className="iact" onClick={e => e.stopPropagation()}>
                        <button className="btn sm primary" onClick={() => void answer(i, true)}><Icon name="check" />Accept</button>
                        <button className="btn sm ghost" onClick={() => void answer(i, false)}>No thanks</button></span>)}
                    <span className="it">{new Date(i.c.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </div>);
            })}
          </div>
        </div>, document.body)}
    </>);
}
