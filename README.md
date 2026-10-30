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

The app uses Supabase Auth email/password sign-in and account creation. If email confirmation is enabled, configure the Supabase Auth URL allow-list to include the local development URL and the deployed GitHub Pages URL (`https://andygeng2023.github.io/WIP-AutoBusiness/`). Account confirmation links are directed back to the app base path.

## Data and security

The workspace database lives in Supabase project `wctlalaitdrzihvthvze`. The app uses the public publishable key from the browser and relies on Supabase Auth plus row-level security for access control. The creator of a company becomes its owner through the database trigger. Workspace data is shared across signed-in members who have company membership.

The app currently loads shared data when a workspace is opened; live push updates between already-open browser sessions are not yet implemented. Refresh or reopen the workspace to load changes made by another user. Company owners and admins can invite teammates from Settings → General. Invite links are bound to the intended email address and expire after seven days.

## AI provider and limitations

Private employee chat replies and job deliverables use the separately deployed ChatGPT Playwright browser worker. A manually authenticated ChatGPT session is stored on the worker host, not in the browser app. AI provider token usage and billing are not exposed by this browser integration, so the dashboard reports saved deliverables and approved jobs rather than invented usage units.

The connector and automation settings are preferences, not integrations with external services. GitHub, Slack, Google Drive, and web-search actions are not wired up. Jobs are run when a user explicitly starts generation; there is no always-on background worker.


## ChatGPT browser automation (Playwright)

AutoBusiness calls the Playwright worker directly over HTTPS. The worker runs on the owner's always-on computer and is published to the internet through the free Tailscale Funnel service. Supabase remains responsible for sign-in and workspace data; it is no longer in the AI request path.

### 1. Install and sign in to Tailscale

Install Tailscale on the computer that will host the worker and sign in. Enable MagicDNS and HTTPS certificates in the Tailscale admin console, then enable Funnel for the tailnet. Tailscale Funnel is available on its free plan and provides a stable `https://<device>.<tailnet>.ts.net` address without purchasing a domain.

On macOS, use a Tailscale build that supports Funnel port sharing. See the [Tailscale Funnel requirements](https://tailscale.com/docs/features/tailscale-funnel).

### 2. Create the ChatGPT browser session

On the hosting computer, install Node.js 20 or newer, then run:

```sh
git clone https://github.com/andygeng2023/WIP-AutoBusiness.git
cd WIP-AutoBusiness/services/chatgpt-playwright
npm install
CHATGPT_STORAGE_STATE="$HOME/.autobusiness/chatgpt-auth.json" npm run login
```

Sign in to ChatGPT in the browser window and finish the login yourself. The session file contains login cookies. Keep it private and never commit or share it.

### 3. Configure and start the local worker

From `services/chatgpt-playwright`, start the worker with the Supabase project settings used by AutoBusiness:

```sh
export SUPABASE_URL="https://wctlalaitdrzihvthvze.supabase.co"
export SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
export CHATGPT_STORAGE_STATE="$HOME/.autobusiness/chatgpt-auth.json"
export APP_ORIGINS="https://andygeng2023.github.io,http://localhost:5173,http://127.0.0.1:5173"
npm start
```

Keep this terminal running. In a second terminal, expose it through Tailscale Funnel:

```sh
tailscale funnel --bg --https=443 http://127.0.0.1:8787
tailscale funnel status
```

The status output shows the stable HTTPS address. Test it by opening `https://<your-device>.<your-tailnet>.ts.net/health`. It should return JSON with `"ok": true` and `"sessionConfigured": true`.

### 4. Connect the AutoBusiness website

In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and create a repository variable:

- Name: `PLAYWRIGHT_SERVICE_URL`
- Value: the Tailscale Funnel HTTPS address, without a trailing slash (for example, `https://my-mac.my-tailnet.ts.net`).

Run the **Deploy to GitHub Pages** workflow again. The build injects this public endpoint into the frontend. AutoBusiness sends each request directly to the worker with the signed-in user's Supabase access token.

The worker validates that token against Supabase Auth before accepting a prompt. It also restricts browser origins to the configured AutoBusiness site and local development URLs. The Supabase publishable key is public by design; never use a service-role key here.

### 5. Keep it running

The hosting computer must remain powered on, connected to the internet, and signed in to Tailscale. Keep the Node worker running. Funnel runs in the background and resumes after a Tailscale service restart when configured with `--bg`; after a full computer reboot, make sure the worker process is started again. If the worker is offline, AI requests will fail until it is restarted.

### Operational notes

- This setup has no separate worker-hosting subscription. Tailscale Funnel is available on its free plan, subject to its published bandwidth limits.
- The worker serializes requests because all employees share one ChatGPT browser session.
- Browser automation is not an official ChatGPT API. UI changes, account usage limits, or expired sessions can interrupt requests.
- The ChatGPT session file is equivalent to a password. Store it only on the hosting computer with restricted file permissions.
- The legacy `supabase/functions/chatgpt-playwright` proxy is no longer used by the frontend after this change. It can be left deployed; it is not part of the direct request path.
