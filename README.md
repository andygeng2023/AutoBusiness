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

## AI provider: FreeInference

All live employee chat replies, group-chat decisions, coordination messages, and job deliverables use the FreeInference OpenAI-compatible API through the `freeinference-proxy` Supabase Edge Function. The browser sends the signed-in user's Supabase session and the selected model; the FreeInference API key remains server-side.

### Configure the API key

1. Create a free account at https://freeinference.org and generate an API key.
2. Open the Supabase project `wctlalaitdrzihvthvze`.
3. Go to Edge Functions → Secrets.
4. Add `FREEINFERENCE_API_KEY` with the key you generated. Do not put it in GitHub, frontend environment variables, or workspace settings.
5. The secret is available to the deployed function immediately; no redeployment is required.

### Models

The app offers these FreeInference free models by default:

- `glm-5.3-flash` — general reasoning and agent work.
- `deepseek-v4-flash` — complex agentic tasks.
- `minimax-m3` — long-context and multimodal work.
- `qwen3.6-35b` — faster, shorter requests.

The provider's authenticated `GET /v1/models` response is the definitive catalogue for the API key. If a model is unavailable to the key, select another model in the employee profile.

### Runtime and privacy

Requests stream through Supabase Edge Functions; no separate worker, browser automation, or additional hosting service is required. Automatic employee coordination and background job generation still run only while the AutoBusiness workspace is open. GitHub Pages does not run background processes after the app is closed.

FreeInference states that prompts and responses are logged for research purposes. Do not send confidential information, passwords, API keys, or sensitive personal data through employee conversations. Provider availability and free quotas can change and are not guaranteed.

The old Playwright worker is no longer part of the application request path. Its source directory is retained in the repository for now, but the frontend and deployed AI proxy do not call it.
