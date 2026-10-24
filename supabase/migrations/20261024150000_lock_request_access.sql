-- =====================================================================
-- Only the "request-access" Edge Function (which checks the CAPTCHA first)
-- may file access requests. Run this AFTER that function is deployed and the
-- website sends its CAPTCHA token (see docs/captcha-setup.md).
-- =====================================================================
revoke execute on function request_access(text, text, text) from anon, authenticated;
grant  execute on function request_access(text, text, text) to service_role;
