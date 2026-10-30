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
- Job assignment, deliverable generation through the ChatGPT Playwright browser worker, revision requests, and approval.
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

Private employee chat replies and job deliverables use the separately deployed ChatGPT Playwright browser worker. A manually authenticated ChatGPT session is stored on the worker host, not in the browser app. AI provider token usage and billing are not exposed by this browser integration, so the dashboard reports saved deliverables and approved jobs rather than invented usage units.

The connector and automation settings are preferences, not integrations with external services. GitHub, Slack, Google Drive, and web-search actions are not wired up. Jobs are run when a user explicitly starts generation; there is no always-on background worker.


## ChatGPT browser automation (Playwright)

Live AI requests are routed through the authenticated `chatgpt-playwright` Supabase Edge Function to a separately hosted Node.js Playwright worker. The worker uses a manually authenticated ChatGPT browser session; no OpenRouter API key or OpenRouter model catalogue is used. Employee prompts, chat history and assignment context are passed to the worker and the response is returned to the existing employee workflows using an OpenAI-compatible streaming response.

### 1. Create the ChatGPT browser session

Use Node.js 20 or newer on a computer with a graphical desktop:

```sh
cd services/chatgpt-playwright
npm install
npm run login
```

A browser opens. Sign in to ChatGPT yourself, complete any verification, then return to the terminal and press Enter. The script writes `.auth/chatgpt-state.json`. This file contains authenticated session cookies and must be treated like a password. Never commit it, publish it, or send it to anyone.

### 2. Deploy the Playwright worker

Build and deploy `services/chatgpt-playwright/Dockerfile` to a persistent Node container host. Mount a persistent volume at `/data` and place the authenticated state file at `/data/chatgpt-auth.json`. Set these environment variables:

- `PLAYWRIGHT_SERVICE_TOKEN`: a long random secret shared only with the Supabase Edge Function.
- `CHATGPT_STORAGE_STATE=/data/chatgpt-auth.json`
- `PORT=8787`

The worker exposes `GET /health` and an authenticated `POST /v1/chat/completions`. Requests are serialized because a single ChatGPT account/browser session is used. The service must be reachable over HTTPS from Supabase. Keep its access token and browser-state file private. If ChatGPT signs the session out, repeat the manual login process and securely replace the mounted state file.

### 3. Configure Supabase

Set Edge Function secrets in the Supabase Dashboard:

- `PLAYWRIGHT_SERVICE_URL`: the HTTPS base URL of the deployed worker, without a trailing slash.
- `PLAYWRIGHT_SERVICE_TOKEN`: exactly the same random token configured on the worker.

Deploy the new function:

```sh
supabase functions deploy chatgpt-playwright
```

The function validates the signed-in Supabase user before forwarding requests. The worker token and ChatGPT session never reach the browser frontend.

### Operational limitations

This is browser automation of the ChatGPT website, not a supported API integration. Website UI changes can require selector updates; responses can fail when ChatGPT changes its login or composer flow, rate limits the account, or expires its session. Browser-based automation may be restricted by ChatGPT terms and account policies; use only an account and session you are authorised to operate. The worker processes one request at a time and the ChatGPT account's own usage limits apply. A hosted worker and persistent volume are required; GitHub Pages and Supabase Edge Functions cannot themselves host a persistent Playwright browser.

The previous `openrouter-proxy` function is no longer called by the frontend. Remove its old OpenRouter secrets from Supabase after confirming the new worker is deployed and responding.
