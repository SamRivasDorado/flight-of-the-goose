import { useState, type FormEvent } from 'react';
import { db } from '../lib/supabase';
import { APP_NAME } from '../config';
import { Logo } from '../components/Logo';
import { useSession } from './session';

type Mode = 'signin' | 'signup' | 'forgot' | 'link';
const MIN_PASSWORD = 8;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
/** Where emailed links bring the person back to. */
const backTo = () => window.location.origin + import.meta.env.BASE_URL;
/** The public website sits one level above the app (only when the app is served under /app/). */
const websiteHref = import.meta.env.BASE_URL === '/' ? null : '/';

/** Links in the approval and invitation emails open the "Create account" form with the address filled in: /app/?join=1&email=... */
const joinParams = (() => {
  try { const q = new URLSearchParams(window.location.search); return q.get('join') ? { email: q.get('email') ?? '' } : null; } catch { return null; }
})();

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That email and password do not match. If you signed in before with an email link, use “Forgot password?” to choose a password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first: open the confirmation email we sent you, then sign in.';
  if (m.includes('database error saving new user') || m.includes('invite-only'))
    return 'Goose is invite-only for now. This address has not been approved yet: ask for access at flightofthegoose.com, or use the address your invitation went to.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (m.includes('password should be') || m.includes('weak')) return `Choose a longer password (at least ${MIN_PASSWORD} characters).`;
  return message;
}

/** Sign in with email and password, create an account, reset a password, or get a one-time email link. */
export function Login() {
  const [mode, setMode] = useState<Mode>(joinParams ? 'signup' : 'signin');
  const [email, setEmail] = useState(joinParams?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | 'link' | 'confirm' | 'reset'>(null);

  function go(m: Mode) { setMode(m); setError(null); setSent(null); setPassword(''); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) { setError('Enter a valid email address.'); return; }
    const addr = email.trim();
    const auth = db().auth;
    if ((mode === 'signin' || mode === 'signup') && password.length < (mode === 'signup' ? MIN_PASSWORD : 1)) {
      setError(mode === 'signup' ? `Choose a password of at least ${MIN_PASSWORD} characters.` : 'Enter your password.'); return;
    }
    setBusy(true); setError(null);
    let err: string | null = null;
    if (mode === 'signin') {
      err = (await auth.signInWithPassword({ email: addr, password })).error?.message ?? null;
    } else if (mode === 'signup') {
      const { data, error } = await auth.signUp({ email: addr, password, options: { emailRedirectTo: backTo() } });
      err = error?.message ?? null;
      if (!err && !data.session) setSent('confirm');
    } else if (mode === 'forgot') {
      err = (await auth.resetPasswordForEmail(addr, { redirectTo: backTo() })).error?.message ?? null;
      if (!err) setSent('reset');
    } else {
      err = (await auth.signInWithOtp({ email: addr, options: { emailRedirectTo: backTo() } })).error?.message ?? null;
      if (!err) setSent('link');
    }
    setBusy(false);
    if (err) setError(friendly(err));
  }

  const title = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', link: 'Sign in with an email link' }[mode];
  const action = { signin: 'Sign in', signup: 'Create account', forgot: 'Email me a reset link', link: 'Email me a sign-in link' }[mode];

  return (
    <div className="auth">
      <form className="authbox" onSubmit={submit}>
        <div className="row"><Logo variant="plain" size={52} /><h1>{APP_NAME}</h1></div>
        {sent ? (
          <>
            <p>
              {sent === 'confirm' && <>We sent a confirmation link to <b>{email.trim()}</b>. Open it to finish creating your account. If you already have an account with this address, sign in instead.</>}
              {sent === 'reset' && <>If an account exists for <b>{email.trim()}</b>, we sent a link to choose a new password. Open it on this device.</>}
              {sent === 'link' && <>We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device to continue.</>}
            </p>
            <button type="button" className="btn ghost sm" onClick={() => go('signin')}>Back to sign in</button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              <b style={{ color: 'var(--fg)' }}>{title}.</b>{' '}
              {mode === 'signin' && 'If someone invited you, use the address the invitation went to.'}
              {mode === 'signup' && 'If someone invited you, use the address the invitation went to.'}
              {mode === 'forgot' && 'Enter your email and we will send you a link to choose a new password.'}
              {mode === 'link' && 'We will email you a one-time link, no password needed.'}
            </p>
            <div>
              <label className="lbl" htmlFor="email">Email</label>
              <input id="email" className="field-in" type="email" autoComplete="email" value={email}
                     onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            {(mode === 'signin' || mode === 'signup') && (
              <div>
                <label className="lbl" htmlFor="password">Password</label>
                <input id="password" className="field-in" type="password" value={password}
                       autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                       onChange={e => setPassword(e.target.value)} />
                {mode === 'signup' && <div className="hint" style={{ marginTop: 4 }}>At least {MIN_PASSWORD} characters.</div>}
              </div>
            )}
            {error && <div className="err">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : action}</button>
            <div className="authlinks">
              {mode === 'signin' && <>
                <button type="button" className="btn ghost sm" onClick={() => go('forgot')}>Forgot password?</button>
                <button type="button" className="btn ghost sm" onClick={() => go('link')}>Email me a link instead</button>
                <button type="button" className="btn ghost sm" onClick={() => go('signup')}>Create an account</button>
                {websiteHref && <a className="btn ghost sm" href={websiteHref + '#request'}>Request access</a>}
              </>}
              {mode !== 'signin' && <button type="button" className="btn ghost sm" onClick={() => go('signin')}>Back to sign in</button>}
            </div>
          </>
        )}
        {websiteHref && <a className="authback" href={websiteHref}>← Back to flightofthegoose.com</a>}
      </form>
    </div>
  );
}

/** Shown after someone opens a password-reset link: choose the new password, then carry on signed in. */
export function SetNewPassword() {
  const { doneRecovering, signOut } = useSession();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD) { setError(`Choose a password of at least ${MIN_PASSWORD} characters.`); return; }
    if (pw !== pw2) { setError('The two passwords are not the same.'); return; }
    setBusy(true); setError(null);
    const { error } = await db().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(friendly(error.message)); else doneRecovering();
  }

  return (
    <div className="auth">
      <form className="authbox" onSubmit={submit}>
        <div className="row"><Logo variant="plain" size={52} /><h1>{APP_NAME}</h1></div>
        <p className="muted" style={{ margin: 0 }}><b style={{ color: 'var(--fg)' }}>Choose a new password.</b> You will stay signed in afterwards.</p>
        <div>
          <label className="lbl" htmlFor="pw">New password</label>
          <input id="pw" className="field-in" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
          <div className="hint" style={{ marginTop: 4 }}>At least {MIN_PASSWORD} characters.</div>
        </div>
        <div>
          <label className="lbl" htmlFor="pw2">Repeat it</label>
          <input id="pw2" className="field-in" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
        </div>
        {error && <div className="err">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <div className="authlinks"><button type="button" className="btn ghost sm" onClick={() => void signOut()}>Cancel and sign out</button></div>
      </form>
    </div>
  );
}
