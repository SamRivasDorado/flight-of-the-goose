/**
 * Email notifications: each person's choices (table email_prefs, one row per person for all
 * their workspaces), the test email, and the example shown in "See an example".
 *
 * The emails themselves are put together and sent by the database
 * (supabase/migrations/20261111100000_email_notifications.sql, email_render). renderEmail()
 * below draws the same email for the example: keep the two in step when one changes.
 */
import { db } from './supabase';

export interface EmailPrefs {
  enabled: boolean; mentions: boolean; comments: boolean; assigned: boolean; help: boolean; due: boolean;
  timing: 'soon' | 'daily';
}
export const EMAIL_DEFAULTS: EmailPrefs = { enabled: true, mentions: true, comments: true, assigned: true, help: true, due: true, timing: 'soon' };

const missing = (m: string) => /email_prefs|send_test_email/.test(m) && /(does not exist|schema cache|not find)/i.test(m);
export const EMAILS_NEED_UPDATE = 'Emails need a one-time database update first.';

/** Your choices, or the defaults when you never changed them. null: the database update is not there yet. */
export async function getEmailPrefs(uid: string): Promise<EmailPrefs | null> {
  const { data, error } = await db().from('email_prefs').select('*').eq('user_id', uid).maybeSingle();
  if (error) { if (missing(error.message)) return null; throw new Error(error.message); }
  if (!data) return { ...EMAIL_DEFAULTS };
  const r = data as Partial<EmailPrefs>;
  return { ...EMAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([k]) => k in EMAIL_DEFAULTS)) } as EmailPrefs;
}

export async function saveEmailPrefs(uid: string, p: EmailPrefs) {
  const { error } = await db().from('email_prefs').upsert({ user_id: uid, ...p, updated_at: new Date().toISOString() });
  if (error) throw new Error(missing(error.message) ? EMAILS_NEED_UPDATE : error.message);
}

/** Sends you the test email. Says in plain words what happened. */
export async function sendTestEmail(): Promise<string> {
  const { data, error } = await db().rpc('send_test_email');
  if (error) throw new Error(missing(error.message) ? EMAILS_NEED_UPDATE : error.message);
  switch (data) {
    case 'sent': return 'Sent. It should arrive within a minute; check the spam folder if it does not.';
    case 'wait': return 'A test email was sent less than a minute ago. Give it a moment.';
    case 'not_ready': return 'Goose cannot send emails yet: the email service is not connected.';
    case 'demo': return 'This is the prototype, so no email is sent. “See an example” shows what it looks like.';
    default: return String(data ?? '');
  }
}

// ---------------------------------------------------------------- the example

export type EmailKind = 'mention' | 'comment' | 'reply' | 'assigned' | 'help' | 'answer' | 'due';
export interface EmailItem { kind: EmailKind; actor?: string; title: string; where?: 'task' | 'note'; project?: string; excerpt?: string; workspace?: string }

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function verb(i: EmailItem) {
  switch (i.kind) {
    case 'mention': return i.where === 'note' ? 'mentioned you in the notebook:' : 'mentioned you on';
    case 'comment': return 'commented on your task';
    case 'reply': return i.where === 'note' ? 'replied in the notebook:' : 'replied on';
    case 'assigned': return 'gave you the task';
    case 'help': return 'offered to help with';
    case 'answer': return i.excerpt === 'accepted' ? 'accepted your offer to help with' : 'said no thanks to your offer to help with';
    case 'due': return 'Due tomorrow:';
  }
}

/** The email Goose sends for these items: subject and HTML (the same as email_render in the database). */
export function renderEmail(items: EmailItem[], name: string): { subject: string; html: string } {
  const several = new Set(items.map(i => i.workspace ?? '')).size > 1;
  let ws: string | undefined, rows = '', last = '';
  for (const i of items) {
    const title = i.title || 'Untitled task', actor = i.actor || 'Someone', v = verb(i);
    last = (i.kind === 'due' ? v : `${actor} ${v}`) + ' ' + title;
    if (several && i.workspace !== ws) {
      ws = i.workspace;
      rows += `<tr><td style="padding:18px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b6d73">${esc(ws ?? '')}</td></tr>`;
    }
    const ex = i.excerpt && !['answer', 'due', 'assigned'].includes(i.kind) ? (i.excerpt.length > 280 ? i.excerpt.slice(0, 277) + '…' : i.excerpt) : '';
    rows += '<tr><td style="padding:12px 0;border-top:1px solid #ecebe6"><div style="line-height:1.45">'
      + (i.kind === 'due' ? '<span style="color:#b5561d;font-weight:bold">Due tomorrow:</span>' : `<b>${esc(actor)}</b> ${esc(v)}`)
      + ` <a href="#" onclick="return false" style="color:#1b1c1f;font-weight:bold">${esc(title)}</a></div>`
      + (ex ? `<div style="margin-top:6px;padding:8px 12px;background:#f6f5f0;border-left:3px solid #f28c28;border-radius:6px;color:#3a3b3f;font-size:14px;line-height:1.45">${esc(ex)}</div>` : '')
      + (i.project ? `<div style="margin-top:4px;color:#8a8c91;font-size:12px">${esc(i.project)}</div>` : '')
      + '</td></tr>';
  }
  const n = items.length, nDue = items.filter(i => i.kind === 'due').length;
  const subject = n === 1 ? last : nDue === n ? `${n} of your tasks are due tomorrow` : `${n} updates for you in Goose`;
  const cell = (c: string) => `<td height="4" style="height:4px;font-size:0;line-height:0;background:${c}">&nbsp;</td>`;
  const html = '<div style="background:#f6f5f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1b1c1f">'
    + '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">'
    + `<div style="background:#1b1c1f;padding:14px 22px"><img src="${GOOSE_TILE}" width="32" height="32" alt="" style="vertical-align:middle;border-radius:8px">`
    + '<span style="color:#ffffff;font-weight:bold;font-size:17px;vertical-align:middle;margin-left:10px">Goose</span></div>'
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cell('#F4CB5D')}${cell('#6B9160')}${cell('#5D7A4B')}${cell('#E5A957')}</tr></table>`
    + `<div style="padding:20px 22px 8px"><p style="margin:0 0 6px;font-size:16px">Hello ${esc(name || 'there')},</p>`
    + `<p style="margin:0;color:#6b6d73;font-size:14px">${n === 1 ? 'Here is what happened in Goose.' : 'Here is what happened in Goose since we last wrote.'}</p>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:15px">${rows}</table></div>`
    + '<div style="padding:8px 22px 22px"><span style="display:inline-block;background:#f28c28;color:#1b1c1f;font-weight:bold;padding:11px 18px;border-radius:10px">Open Goose</span></div>'
    + '<div style="padding:14px 22px;border-top:1px solid #ecebe6;color:#8a8c91;font-size:12px;line-height:1.5">You get these emails because you use Goose. '
    + 'Choose which ones, and how often, in <u>your email settings</u>.</div></div></div>';
  return { subject, html };
}

/** The goose tile next to the app (the real email loads it from flightofthegoose.com). */
const GOOSE_TILE = `${import.meta.env.BASE_URL}goose-tile-96.png`;
