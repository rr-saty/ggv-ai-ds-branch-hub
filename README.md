# GGV AI & DS Branch Hub

A responsive student-facing dashboard for the AI & Data Science branch at Guru Ghasidas Vishwavidyalaya, Bilaspur. It brings branch notices, timetable, deadlines, resources and events into one place.

## Stack

- Static frontend: GitHub Pages
- Data/auth: Supabase (project **Manushyaa**, region `ap-south-1`)
- Optional server APIs and protected automation: Vercel
- Calendar sync and approved email automation: n8n, using Google Calendar OAuth and SMTP credentials

## Current setup

- Repository initialized; no production secrets are committed.
- Supabase project ref: `qohpmiockdgotdqaqerr` (`ACTIVE_HEALTHY`). The branch hub schema migration `ggv_ai_ds_branch_hub_20261029` is applied. Existing `History` and `User` tables were retained.
- SQL migration: `supabase/migrations/202610290001_branch_hub.sql`.
- Browser configuration lives in `config.js`. The Supabase URL and publishable/anon key are public values; **never** place a service-role/secret key in frontend files.

## Deploy to GitHub Pages

1. In repository **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
2. The committed `.github/workflows/pages.yml` workflow packages only the static frontend files and deploys on pushes to `main`. Check the **Actions** tab for the first run.
3. After the run succeeds, the expected project site URL is `https://rr-saty.github.io/ggv-ai-ds-branch-hub/` (confirm the final URL in Settings → Pages).
4. In Supabase **Authentication → URL Configuration**, set the site URL and add the exact GitHub Pages URL to allowed redirect URLs.
5. For Vercel CORS, use the origin only: `https://rr-saty.github.io` (no repository path).

## Configure Supabase

1. The `Manushyaa` project is active. Its existing `History` and `User` tables were left in place.
2. The branch hub migration has already been applied. It creates the branch-hub tables, profile role helper, timestamps and row-level security (RLS) policies. Review policies before production.
3. `config.js` is already set to the Manushyaa project URL and its publishable key. The publishable key is designed for browser use; the service-role key must remain server-side.
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
- Vercel `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `ALLOWED_ORIGINS` and optional OpenAI key.
- University/branch approval to publish timetable and deadline data and send notifications.

No live Google Calendar or email connection is active until you configure the relevant credentials and test the workflow. Do not place credentials in public issues, chat messages, frontend code, or committed JSON exports.
