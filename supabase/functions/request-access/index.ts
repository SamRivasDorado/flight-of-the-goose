// Supabase Edge Function "request-access".
// The website form sends { email, name, note, token } here. We check the
// Cloudflare Turnstile token (the CAPTCHA) and only then file the request.
// Settings needed: secret TURNSTILE_SECRET. "Verify JWT" must be switched OFF for this function.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  let input: { email?: string; name?: string; note?: string; token?: string };
  try { input = await req.json(); } catch { return reply(400, { error: 'Bad request' }); }

  const token = String(input.token ?? '');
  if (!token) return reply(400, { error: 'captcha' });

  const form = new URLSearchParams({ secret: Deno.env.get('TURNSTILE_SECRET') ?? '', response: token });
  const ip = req.headers.get('cf-connecting-ip'); if (ip) form.set('remoteip', ip);
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const verdict = await check.json().catch(() => ({ success: false }));
  if (!verdict.success) return reply(400, { error: 'captcha' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await db.rpc('request_access', {
    p_email: String(input.email ?? ''), p_name: String(input.name ?? ''), p_note: String(input.note ?? ''),
  });
  if (error) return reply(400, { error: 'email' });
  return reply(200, { ok: true });
});
