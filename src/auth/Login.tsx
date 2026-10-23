import { useState, type FormEvent } from 'react';
import { db } from '../lib/supabase';
import { APP_NAME } from '../config';
import { Logo } from '../components/Logo';

/** Passwordless sign-in: the person gets a link by email. New emails create an account. */
export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError(null);
    const { error } = await db().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }

  return (
    <div className="auth">
      <form className="authbox" onSubmit={submit}>
        <div className="row"><Logo variant="plain" size={52} /><h1>{APP_NAME}</h1></div>
        {sent ? (
          <>
            <p>We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device to continue.</p>
            <button type="button" className="btn ghost sm" onClick={() => setSent(false)}>Use a different email</button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Sign in or create an account with your email. If someone invited you, use the address the invitation went to.
            </p>
            <div>
              <label className="lbl" htmlFor="email">Email</label>
              <input id="email" className="field-in" type="email" autoComplete="email" value={email}
                     onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            {error && <div className="err">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </>
        )}
      </form>
    </div>
  );
}
