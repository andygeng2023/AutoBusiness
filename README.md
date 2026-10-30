# AutoBusiness

AutoBusiness is a multi-company workspace for configuring AI employees, assigning work, reviewing deliverables, tracking goals, and communicating with the team.

## Current capabilities

- Supabase email/password authentication with persistent sessions.
- Company creation and membership-scoped company lists.
- Owner/admin invitation links restricted to the invited email, hashed at rest, and expiring after seven days.
- Cloud-backed departments, employees, job briefs, job results, review feedback, conversations, messages, workspace settings, and goals.
- Row-level security for workspace data; unauthenticated access to workspace tables is revoked. Private employee conversations and their messages are limited to the creating member, while group chats are available to company members.
- Real dashboard counts based on stored employee, job, deliverable, and goal records rather than seeded example metrics.
- Goal creation and progress tracking saved to the company workspace.
- Job assignment, deliverable generation through Puter.js, revision requests, and approval.
- Responsive desktop and mobile layouts.

New companies are created with a starter AI team and departments. Jobs, conversations, goals, and activity start empty; no fake company results are seeded into a new workspace.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set your Supabase project URL and publishable key. The repository contains a public publishable-key fallback for the configured project, so these values can be overridden for local development.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local URL printed by Vite.

Never put a Supabase service-role or secret key in frontend code or Vite environment variables.

## Authentication setup

The app uses Supabase Auth email/password sign-in and account creation. If email confirmation is enabled, configure the Supabase Auth URL allow-list to include the local development URL and the deployed GitHub Pages URL (`https://andygeng2023.github.io/AutoBusiness/`). Account confirmation links are directed back to the app base path.

## Data and security

The workspace database lives in Supabase project `wctlalaitdrzihvthvze`. The app uses the public publishable key from the browser and relies on Supabase Auth plus row-level security for access control. The creator of a company becomes its owner through the database trigger. Workspace data is shared across signed-in members who have company membership.

The app currently loads shared data when a workspace is opened; live push updates between already-open browser sessions are not yet implemented. Refresh or reopen the workspace to load changes made by another user. Company owners and admins can invite teammates from Settings → General. Invite links are bound to the intended email address and expire after seven days.

## AI provider and limitations

Puter.js is loaded in the browser and is used for private employee chat replies and job deliverables. Availability and model access depend on the Puter.js environment and its user authorization. AI provider token usage and billing are not exposed by this browser integration, so the dashboard reports saved deliverables and approved jobs rather than invented usage units.

The connector and automation settings are preferences, not integrations with external services. GitHub, Slack, Google Drive, and web-search actions are not wired up. Jobs are run when a user explicitly starts generation; there is no always-on background worker.


## OpenRouter server-side proxy

OpenRouter chat completions are sent through the authenticated `openrouter-proxy` Supabase Edge Function. Provider credentials are never stored in browser storage or included in the frontend bundle.

Before using live OpenRouter generation, configure the Supabase Edge Function secret `OPENROUTER_API_KEYS` in the Supabase Dashboard. Its value can be a JSON array of keys (recommended), for example `["key-one","key-two"]`, or a comma-separated list. A single `OPENROUTER_API_KEY` secret is also accepted for a one-key setup. Do not commit real keys to this repository or paste them into chat.

The proxy selects configured keys round-robin. When OpenRouter returns HTTP 429, that key is skipped for a four-hour cooldown within the running Edge Function instance and the next available key is tried. The proxy preserves upstream streaming responses and requires a valid signed-in Supabase user JWT. Cooldown state is in-memory and can reset when Supabase replaces an Edge Function instance; this is best-effort key rotation, not a durable cross-instance rate-limit ledger. Provider-wide/account-wide limits may still affect every key.

Set `APP_ORIGINS` only if the app is hosted on additional origins; it accepts a comma-separated allow-list. The GitHub Pages origin and local Vite origins are allowed by default.

## Build and test

- `npm run build` — TypeScript check and production build.
- `npm test` — Vitest suite.

## Deployment

GitHub Pages deployment is configured for the `main` branch. Vite uses `/AutoBusiness/` as its base path in GitHub Actions.
