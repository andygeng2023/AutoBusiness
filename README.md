# AutoBusiness

AutoBusiness is a company workspace foundation for a future AI workforce platform. Stage 1 focuses on company setup, workspace navigation, authenticated persistence, and a clear boundary for future Puter-powered AI execution.

## Current Stage 1 scope

- Responsive company workspace dashboard and navigation.
- Company creation and company directory with search.
- Basic company settings and recent activity.
- Demo mode using browser-local storage when Supabase environment variables are absent.
- Supabase Auth integration and company persistence when configured.
- Initial PostgreSQL schema and row-level security policies for organisations, memberships, companies, and audit events.
- Puter.js adapter boundary. Stage 1 intentionally does not call AI models.
- Unit tests, TypeScript checks, and a CI workflow.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. Without Supabase settings, the app runs in **demo mode** and stores sample workspace data in this browser only. Do not use demo mode for sensitive or shared business data.

## Supabase setup

1. Create or select a Supabase project.
2. Copy the project URL and publishable/anon key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Apply `supabase/migrations/0001_stage1_foundation.sql`.
4. Configure the Supabase Auth email/password settings and allowed redirect URLs.
5. Restart the dev server.

Never put a Supabase service-role key in frontend environment variables. The Stage 1 migration intentionally restricts audit-event writes and membership management. Before enabling production onboarding, implement a trusted, atomic server-side/RPC flow that creates an organisation and its owner membership together, then update company creation to attach that organisation ID. This avoids insecure client-created memberships and partial setup.

## Puter integration

Puter.js is planned as the AI provider interface for later stages. The adapter in `src/lib/puter.ts` documents the boundary and fails clearly until the browser SDK is loaded. No AI calls occur in Stage 1, so creating a company does not consume AI usage. Later stages should invoke Puter from an explicit user-authorised action, validate model outputs, and keep tool execution behind permission checks.

Puter's user-pays model means users may be prompted to authenticate with Puter and usage availability/pricing can depend on their account and the chosen model. Do not promise unlimited free AI usage.

## Verify

```bash
npm run typecheck
npm test
npm run build
```

## Roadmap

- Stage 2: employee profiles, departments, tasks, projects, assignments and shared knowledge.
- Stage 3: Puter-powered agent execution with structured outputs and controlled tools.
- Stage 4: durable orchestration, delegation, budgets, approvals and retries.
- Later: integrations, publishing workflows, analytics and team administration.

## Important limitations

This is a Stage 1 foundation, not a finished autonomous-agent platform. Demo-mode data is local to one browser. Production multi-user operation requires Supabase configuration and the trusted onboarding flow described above. UI sections for later stages are placeholders by design.