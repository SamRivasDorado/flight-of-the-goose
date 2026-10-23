import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when .env.local holds the project URL and anon key. */
export const isConfigured = Boolean(url && key && !url.includes('your-project-ref'));

/** Null until the app is configured; the app shows a setup screen instead. */
export const supabase: SupabaseClient | null = isConfigured ? createClient(url!, key!) : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured. Copy .env.example to .env.local.');
  return supabase;
}
