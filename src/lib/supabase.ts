import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when .env.local holds the project URL and anon key. */
export const isConfigured = Boolean(url && key && !url.includes('your-project-ref'));

/**
 * What the page address said when it was opened, read BEFORE the client below tidies it away:
 * a password-reset link (type=recovery), or an emailed link that failed (expired, or already used).
 */
const landingHash = typeof window === 'undefined' ? '' : window.location.hash;
export const landedOnRecovery = /[#&]type=recovery\b/.test(landingHash) && !/[#&]error=/.test(landingHash);
export const landingLinkError: string | null = (() => {
  const m = /[#&]error_code=([a-z_]+)/.exec(landingHash);
  if (!m) return /[#&]error=/.test(landingHash) ? 'That link did not work. Please ask for a new one.' : null;
  return m[1] === 'otp_expired'
    ? 'That link has expired or was already used. Some email programs open links to check them, which uses them up. Please ask for a new one and open it right away.'
    : 'That link did not work. Please ask for a new one.';
})();

/** Null until the app is configured; the app shows a setup screen instead. */
export const supabase: SupabaseClient | null = isConfigured ? createClient(url!, key!) : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured. Copy .env.example to .env.local.');
  return supabase;
}
