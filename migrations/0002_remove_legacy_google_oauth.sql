-- Google OAuth is site-login infrastructure configured by Cloudflare secrets,
-- never an administrator-managed LLM credential.
DELETE FROM integrations
WHERE provider IN ('google_oauth', 'google_oauth_candidate');
