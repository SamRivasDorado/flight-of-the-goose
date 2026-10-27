import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useWorkspace } from '../auth/session';
import { addComment, deleteComment, listComments, listMembers, noCommentsTable, updateComment } from '../lib/data';
import { useSolo } from '../lib/solo';
import { canEdit, type Comment, type Member } from '../lib/types';
import { Avatar } from './Logo';

/** Lets the inbox and comment counts know something changed. */
export const commentsChanged = () => window.dispatchEvent(new Event('goose:comments'));

const when = (iso: string) => {
  const d = new Date(iso), today = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })} ${time}`;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The comment text with @mentions highlighted. */
export function CommentBody({ c, members }: { c: Pick<Comment, 'body' | 'mentions'>; members: Member[] }) {
  const names = members.filter(m => c.mentions?.includes(m.id)).map(m => m.display_name).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{c.body}</>;
  const parts = c.body.split(new RegExp(`(@(?:${names.map(esc).join('|')}))`, 'g'));
  return <>{parts.map((p, i) => p.startsWith('@') && names.includes(p.slice(1)) ? <span key={i} className="mention">{p}</span> : p)}</>;
}

/** People named with @Name in a text (whole display names), except yourself. */
export const mentionedIds = (text: string, members: Member[], me: string) =>
  members.filter(m => m.id !== me && text.includes(`@${m.display_name}`)).map(m => m.id);

/** Any text with @Name highlighted for the people of the workspace (descriptions, notebook lines). */
export function MentionText({ text, members }: { text: string; members: Member[] }) {
  const names = members.map(m => m.display_name).filter(n => text.includes(`@${n}`)).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(@(?:${names.map(esc).join('|')}))`, 'g'));
  return <>{parts.map((p, i) => p.startsWith('@') && names.includes(p.slice(1)) ? <span key={i} className="mention">{p}</span> : p)}</>;
}

/**
 * A text box with the @ picker: typing @ lists the people of the workspace (or says why nobody
 * can be mentioned). Used for comments, task descriptions and notebook entries.
 */
export function MentionArea({ value, onChange, members, me, solo, onKeyDown, onBlur, ...rest }: {
  value: string; onChange: (v: string) => void; members: Member[]; me: string; solo: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; onBlur?: () => void;
  className?: string; placeholder?: string; rows?: number; autoFocus?: boolean; readOnly?: boolean; style?: CSSProperties; 'aria-label'?: string;
}) {
  const [pick, setPick] = useState<{ q: string; at: number; i: number } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const people = members.filter(m => m.id !== me);
  const matches = pick ? people.filter(m => m.display_name.toLowerCase().includes(pick.q.toLowerCase())).slice(0, 6) : [];
  function change(v: string, caret: number) {
    onChange(v);
    const m = /(^|\s)@([\p{L}\p{M}'’.-]*)$/u.exec(v.slice(0, caret));
    setPick(m ? { q: m[2], at: caret - m[2].length - 1, i: 0 } : null);
  }
  function choose(m: Member) {
    if (!pick) return;
    const end = pick.at + 1 + pick.q.length;
    onChange(`${value.slice(0, pick.at)}@${m.display_name} ${value.slice(end)}`); setPick(null);
    const pos = pick.at + m.display_name.length + 2;
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });
  }
  function key(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (pick && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPick({ ...pick, i: (pick.i + 1) % matches.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPick({ ...pick, i: (pick.i - 1 + matches.length) % matches.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[pick.i]); return; }
    }
    if (pick && e.key === 'Escape') { e.stopPropagation(); setPick(null); return; }
    onKeyDown?.(e);
  }
  return (
    <div className="marea">
      <textarea ref={ta} {...rest} value={value} onChange={e => change(e.target.value, e.target.selectionStart)} onKeyDown={key}
        onBlur={() => { setTimeout(() => setPick(null), 150); onBlur?.(); }} />
      {pick && !rest.readOnly && matches.length === 0 && (
        <div className="mpick none" role="status">{solo
          ? 'Solo mode is on, so there is nobody else to mention. Switch it off in Your profile to work with others.'
          : people.length === 0 ? 'Nobody else is in this workspace yet. Invite people from the Team page to mention them.'
          : `Nobody here is called “${pick.q}”.`}</div>)}
      {pick && !rest.readOnly && matches.length > 0 && (
        <div className="mpick" role="listbox" aria-label="Mention someone">
          {matches.map((m, i) => (
            <button key={m.id} role="option" aria-selected={i === pick.i} className={i === pick.i ? 'on' : ''}
              onMouseDown={e => { e.preventDefault(); choose(m); }}><Avatar m={m} size="sm" />{m.display_name}{m.title && <span className="muted">{m.title}</span>}</button>))}
        </div>)}
    </div>);
}

/** A box to write a comment, with an @ picker for people in the workspace. */
function Composer({ members, me, initial = '', solo, busy, submitLabel, onSubmit, onCancel, autoFocus }: {
  members: Member[]; me: string; initial?: string; solo: boolean; busy: boolean; submitLabel: string;
  onSubmit: (body: string, mentions: string[]) => Promise<boolean>; onCancel?: () => void; autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  async function submit() {
    const body = text.trim(); if (!body || busy) return;
    if (await onSubmit(body, mentionedIds(body, members, me))) setText('');
  }
  return (
    <div className="ccompose">
      <MentionArea className="notes" rows={2} value={text} onChange={setText} members={members} me={me} solo={solo} autoFocus={autoFocus}
        aria-label="Write a comment" placeholder="Write a comment. Type @ to mention someone."
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
          if (e.key === 'Escape' && onCancel) { e.stopPropagation(); onCancel(); }
        }} />
      <div className="cfoot"><span className="hint">Ctrl or ⌘ + Enter to send</span><span className="grow" />
        {onCancel && <button className="btn sm ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn sm primary" disabled={busy || !text.trim()} onClick={() => void submit()}>{submitLabel}</button></div>
    </div>);
}

/** The comments on one task or one notebook entry, oldest first, with a box to add one. */
export function CommentThread({ target, autoFocus, onCount }: { target: { task_id?: string; note_id?: string }; autoFocus?: boolean; onCount?: (n: number) => void }) {
  const ws = useWorkspace();
  const { solo } = useSolo();
  const [list, setList] = useState<Comment[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const key = target.task_id ?? target.note_id;

  async function load() {
    try {
      const [c, m] = await Promise.all([listComments(target), members.length ? Promise.resolve(members) : listMembers(ws.workspace_id)]);
      setList(c); setMembers(m); onCount?.(c.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (noCommentsTable(msg)) setMissing(true); else setErr(msg);
    }
  }
  useEffect(() => { setList(null); void load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); commentsChanged(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }

  if (missing) return <div className="hint">Comments need a one-time database update first.</div>;
  if (!list) return <div className="hint">{err ?? 'Loading comments…'}</div>;
  const writer = canEdit(ws.access);
  return (
    <div className="cthread">
      {list.map(c => {
        const a = c.author_member_id ? byId.get(c.author_member_id) : undefined;
        const own = c.author_member_id === ws.member_id;
        if (editing === c.id) return (
          <div key={c.id} className="cmt"><Avatar m={a} size="sm" />
            <div className="cmain"><Composer members={members} me={ws.member_id} initial={c.body} solo={solo} busy={busy} submitLabel="Save" autoFocus
              onCancel={() => setEditing(null)} onSubmit={async (b, m) => { const ok = await run(() => updateComment(c.id, b, m)); if (ok) setEditing(null); return ok; }} /></div></div>);
        return (
          <div key={c.id} className="cmt">
            {a ? <Avatar m={a} size="sm" /> : <span className="av sm" style={{ ['--c' as string]: '#999' }}>?</span>}
            <div className="cmain">
              <div className="chead"><b>{a?.display_name ?? 'Someone who left'}</b><span className="muted">{when(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
                <span className="grow" />
                {own && <button className="linkbtn" onClick={() => setEditing(c.id)}>Edit</button>}
                {(own || ws.access === 'admin') && <button className="linkbtn" onClick={() => setConfirmDel(c.id)}>Delete</button>}</div>
              {confirmDel === c.id && <div className="confirm" style={{ margin: '4px 0' }}>Delete this comment?<span className="grow" />
                <button className="btn sm" onClick={() => setConfirmDel(null)}>Keep</button>
                <button className="btn sm danger" onClick={() => void run(async () => { await deleteComment(c.id); setConfirmDel(null); })}>Delete</button></div>}
              <div className="cbody"><CommentBody c={c} members={members} /></div>
            </div>
          </div>);
      })}
      {list.length === 0 && !writer && <div className="hint">No comments yet.</div>}
      {writer
        ? <Composer members={members} me={ws.member_id} solo={solo} busy={busy} submitLabel="Comment" autoFocus={autoFocus}
            onSubmit={(b, m) => run(() => addComment(ws.workspace_id, ws.member_id, target, b, m))} />
        : <div className="hint">Guests can read comments but not write them.</div>}
      {err && <div className="err">{err}</div>}
    </div>);
}
