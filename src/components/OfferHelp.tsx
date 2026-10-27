import { useEffect, useState } from 'react';
import { useWorkspace } from '../auth/session';
import { answerHelp, listTaskHelp, offerHelp, todayISO, withdrawHelp } from '../lib/data';
import { firstName } from '../lib/format';
import { useSolo } from '../lib/solo';
import { canEdit, type HelpOffer, type Member, type Task } from '../lib/types';
import { Avatar, Icon } from './Logo';
import { commentsChanged } from './Comments';

/** Overdue: past its due date and not done. */
export const isOverdue = (t: Pick<Task, 'due_date' | 'status'>) => !!t.due_date && t.status !== 'done' && t.due_date < todayISO();
const open = (o: HelpOffer) => o.status === 'offered' || o.status === 'accepted';

/**
 * "No goose flies alone", in the task panel: who is helping (or offered to), the person helped
 * accepts or declines, and anyone else can offer help on an overdue task assigned to someone else.
 */
export function TaskHelp({ task, members, onChange }: { task: Task; members: Member[]; onChange?: () => void }) {
  const ws = useWorkspace();
  const { solo } = useSolo();
  const [offers, setOffers] = useState<HelpOffer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => listTaskHelp(task.id).then(setOffers);
  useEffect(() => { void load(); }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (solo || !offers) return null;
  const me = ws.member_id;
  const who = (id: string) => members.find(m => m.id === id);
  const live = offers.filter(open);
  const mine = live.find(o => o.helper_member_id === me);
  const canOffer = isOverdue(task) && !!task.assignee_member_id && task.assignee_member_id !== me && canEdit(ws.access) && !mine;
  if (!live.length && !canOffer) return null;
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); commentsChanged(); onChange?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const assignee = task.assignee_member_id ? who(task.assignee_member_id) : undefined;
  return (
    <div className="taskhelp">
      {live.map(o => { const h = who(o.helper_member_id); const pending = o.status === 'offered'; return (
        <div key={o.id} className={`throw ${pending ? 'pending' : ''}`}>
          <Avatar m={h} size="sm" />
          <span>{o.helper_member_id === me ? <b>You</b> : <b>{h?.display_name ?? 'Someone'}</b>} {pending ? 'offered to help' : o.helper_member_id === me ? 'are helping' : 'is helping'}{o.message ? `: “${o.message}”` : ''}</span>
          <span className="grow" />
          {pending && o.helped_member_id === me && <>
            <button className="btn sm primary" disabled={busy} onClick={() => void run(() => answerHelp(o, true))}><Icon name="check" />Accept</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => void run(() => answerHelp(o, false))}>No thanks</button></>}
          {o.helper_member_id === me && <button className="linkbtn" disabled={busy} onClick={() => void run(() => withdrawHelp(o))}>{pending ? 'Withdraw' : 'Stop helping'}</button>}
        </div>); })}
      {canOffer && (
        <div className="throw offer">
          <span className="hint">This task is overdue{assignee ? ` for ${firstName(assignee.display_name)}` : ''}. No goose flies alone.</span><span className="grow" />
          <button className="btn sm" disabled={busy} onClick={() => void run(() => offerHelp(ws.workspace_id, me, task))}><Icon name="users" />Offer help</button>
        </div>)}
      {err && <div className="err">{err}</div>}
    </div>);
}
