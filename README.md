# GGV AI & DS Branch Hub

A responsive student-facing dashboard for the AI & Data Science branch at Guru Ghasidas Vishwavidyalaya, Bilaspur. It brings branch notices, timetable, deadlines, resources and events into one place.

## Stack

- Static frontend: GitHub Pages
- Data/auth: Supabase (project **Manushyaa**, region `ap-south-1`)
- Optional server APIs and protected automation: Vercel
- Calendar sync and approved email automation: n8n, using Google Calendar OAuth and SMTP credentials

## Current setup

- Repository initialized; no production secrets are committed.
- Supabase project ref: `qohpmiockdgotdqaqerr` (project was previously paused and a restore was requested; verify it is `ACTIVE` before running SQL or testing the app).
- SQL migration: `supabase/migrations/202610290001_branch_hub.sql`.
- Browser configuration lives in `config.js`. The Supabase URL and publishable/anon key are public values; **never** place a service-role/secret key in frontend files.

## Deploy to GitHub Pages

1. In repository **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
2. Wait for GitHub Pages to publish the site. The URL will be shown in Settings → Pages.
3. Set the exact published origin in Supabase **Authentication → URL Configuration → Site URL / Redirect URLs**.
4. Add the published URL to the allowed origins used by the optional Vercel API.

## Configure Supabase

1. Confirm the `Manushyaa` project is active and backed up if it contains any data.
2. Inspect the SQL migration and run it in the Supabase SQL Editor. It creates the branch-hub tables, profile role helper, timestamps and row-level security (RLS) policies. Review policies before production, especially if the project contains existing data.
3. Get the project URL and publishable (or legacy anon) key from Supabase project settings and set them in `config.js`. These can be exposed in the browser; the service-role key cannot.
4. Enable the Email auth provider. Create the initial authorized staff account. After that user signs up, promote the verified account in SQL Editor using the exact email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
   ```

5. Test access with separate anonymous, student, faculty and admin accounts. Do not allow a public form to assign roles.

## Google Calendar → Supabase

Import `n8n/ggv-google-calendar-to-supabase-sync.json`. Create a Google Calendar OAuth2 credential in n8n for an account authorized to read the official branch calendar; do not use a private calendar without permission. Set the Supabase project ref and store the Supabase service-role key as an n8n credential/secret, never in GitHub. Events whose title begins `[DEADLINE]` are mapped to `deadlines`; other events go to `schedules`. Test on a safe calendar before activating. Event deletion/cancellation reconciliation should be added before treating the sync as authoritative.

## Approved email notifications

Import `n8n/ggv-approved-email-notifications.json`. Configure SMTP credentials and a verified sender in n8n, set a test recipient, and keep the workflow inactive until authentication and approval checks are implemented and tested. An `approved` flag in a webhook body is **not** authentication. Production calls must originate from a server-side, authenticated staff-approval path; do not wire a public form directly to mass email.

## Optional Vercel API

Import the repository into Vercel if you need server endpoints (`api/`). Configure server-only environment variables there:

- `N8N_WEBHOOK_URL` — production URL for the `ggv-ai-ds-notifications-router` webhook
- `N8N_WEBHOOK_SECRET` — private value matching the n8n Header Auth credential for `x-ggv-automation-secret`; keep it only in Vercel and n8n credentials
- `ALLOWED_ORIGINS` — exact GitHub Pages origin
- `OPENAI_API_KEY` — optional; only for the AI assistant
- `OPENAI_MODEL` — optional model name supported by your account

Set `API_BASE_URL` in `config.js` to your Vercel deployment origin. CORS alone is not authentication; add rate limits and enforce staff permissions on server-side actions.

## Secrets and permissions you must supply

- Supabase publishable/anon key: browser config only.
- Supabase service-role/secret key: n8n secret/credential only; never commit it.
- Google Calendar OAuth authorization: Google account permitted to read the official calendar, plus OAuth setup/consent as required by Google Workspace policy.
- SMTP host, port, username, password/TLS and a verified sender; use a test recipient first.
- Vercel `N8N_WEBHOOK_URL`, `ALLOWED_ORIGINS` and optional OpenAI key.
- University/branch approval to publish timetable and deadline data and send notifications.

No live Google Calendar or email connection is active until you configure the relevant credentials and test the workflow. Do not place credentials in public issues, chat messages, frontend code, or committed JSON exports.
