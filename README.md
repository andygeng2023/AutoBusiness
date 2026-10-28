# AutoBusiness

AutoBusiness is a workspace for managing AI employees across multiple companies.

## Current app experience

- Company chooser and create-company flow.
- Dashboard with team status, jobs, usage estimates, activity and example goals.
- Department-organised employee directory, with nested department support in the data model.
- Employee profiles with editable tone, model preference and custom instructions.
- Private and group conversations, with a Puter.js-powered reply attempt in private employee chats.
- Job assignment, queue, submission and approval flows.
- Settings for security/approval preferences, rulesets, connectors, automation and illustrative usage limits.
- Responsive desktop and mobile layouts.
- Local demo data saved in the browser so the app is usable without credentials.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the local URL printed by Vite.

## AI provider

The UI loads Puter.js in the browser and attempts to use `puter.ai.chat` for private employee chats. Provider/model availability depends on the current Puter.js environment and user authorization. The app includes a fallback when Puter is unavailable.

## Supabase

The migration in `supabase/migrations/0001_workspace.sql` defines the intended multi-company data model and row-level security policies. The current UI is still in browser-local demo mode; shared persistence and authenticated access need to be wired and tested before treating this as a production multi-user system.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in a local `.env` file when implementing the database adapter. Do not expose service-role keys in the browser.

## Build and test

- `npm run build` — TypeScript check and production build.
- `npm test` — Vitest test suite (tests will be added as workflows are implemented).

## Deployment

GitHub Pages deployment is configured for the `main` branch. The Vite base path automatically uses `/AutoBusiness/` in GitHub Actions.
