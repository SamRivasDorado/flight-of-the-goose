# CAPTCHA and approval emails: one-time setup

## 1. Approval emails (Resend key into the Supabase Vault)
1. Resend, API Keys, Create API key (name "Goose approvals", permission "Sending access", domain flightofthegoose.com). Copy it (starts with `re_`).
2. Supabase, SQL Editor, run (with your key inside the quotes):
   `select vault.create_secret('re_YOUR_KEY', 'resend_api_key');`
3. Run `supabase/migrations/20261024140000_approval_email.sql` if not run yet.

## 2. CAPTCHA (Cloudflare Turnstile)
1. Cloudflare dashboard, Turnstile, Add widget. Name "Goose request form", hostname `flightofthegoose.com`, mode Managed. Copy the Site key (public) and Secret key (private).
2. Supabase, Edge Functions, Deploy a new function, Via Editor, name `request-access` (Supabase may give it another web address, such as `dynamic-api`; the website must use the address shown under the function name), paste `supabase/functions/request-access/index.ts`, Deploy. In the function's settings switch **Verify JWT** off.
3. Supabase, Edge Functions, Secrets, add `TURNSTILE_SECRET` = the Secret key.
4. Put the Site key in `website/index.html` (`var TS_KEY = '...'`) and publish.
5. Only then run `supabase/migrations/20261024150000_lock_request_access.sql`, which stops anyone from skipping the CAPTCHA by calling the database directly.
