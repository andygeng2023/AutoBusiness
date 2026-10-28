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
- Stage 5: company-scoped integration permissions, saved Markdown deliverables, and publishing approval workflows.
- Later: secure OAuth/provider adapters, server-side browser automation, real repository operations, external document sync, automated publishing, analytics and team administration.

## Important limitations

This is a Stage 1 foundation, not a finished autonomous-agent platform. Demo-mode data is local to one browser. Production multi-user operation requires Supabase configuration and the trusted onboarding flow described above. UI sections for later stages are placeholders by design.

## Stage 5: Integrations and deliverables

- Company-scoped integration permission records with admin-only management.
- Saved company deliverables (documents, reports, research notes, implementation briefs, and publishing content), with Markdown export.
- Publishing requests with an administrator approval trail and company-scoped row-level security.
- Demo mode stores these records in browser-local storage, isolated by company ID.

**Security and capability boundary:** enabling an integration records permission only; it does not authenticate with the provider or establish an OAuth connection. This stage does not store provider secrets, execute browser automation, write to GitHub repositories, sync cloud drives, or publish externally. Those actions require secure server-side adapters, provider credentials, and explicit authorization. Never put provider tokens or Supabase service-role keys in frontend code.


## Stage 6: Knowledge, approvals, and analytics

- Company knowledge library for policies, procedures, research, decisions, and technical notes, with tags, search, archive, and CSV export.
- Approval centre for reviewing pending publishing requests. Approval is recorded; external publishing remains unavailable until a provider adapter is configured.
- Company analytics overview with operational counts for knowledge, deliverables, AI jobs, employees, pending approvals, and provider-reported AI costs.
- CSV exports for AI job records, deliverables, approvals, employees, and knowledge items.
- New RLS-protected `company_knowledge_items` table and supporting indexes.

Analytics are operational summaries, not financial accounting. Missing provider cost data is not treated as zero-cost usage. Production use requires applying migration `0006_stage6_knowledge.sql`; demo mode uses browser-local data.


## Stage 7: Automation studio

- Company-scoped automation rules with a manual trigger and a task-creation action.
- Enable/disable controls, run-now execution, success/failure history, and CSV export.
- Production task creation and execution history use Supabase row-level security.
- Demo mode stores automation rules, run history, and demo-created tasks in browser-local storage.

**Execution boundary:** this stage runs only when a member clicks Run now. Scheduled jobs, event-driven triggers, external integrations, and background workers are not implemented. Apply `0007_stage7_automation_studio.sql` before using the feature with Supabase.


## Stage 8: Goals and KPIs

- Company-scoped measurable goals with metric name, unit, baseline, current value, target, and optional due date.
- Progress calculation, goal status management, and company summary metrics.
- Row-level security for reads and member updates; owner/admin deletion policy.
- Browser-local demo mode and Supabase-backed production records.

Apply migration `0008_stage8_goals_kpis.sql` before using this feature with Supabase. Progress is an operational indicator based on baseline-to-target ratio, not a financial accounting or HR assessment.


## Stage 9: Activity and audit log

- Add a searchable, company-scoped audit history view with action metadata and CSV export.
- Keep browser-local demo activity clearly labelled as local-only, not a tamper-resistant shared audit record.
- Add a covering index for company audit-history queries while retaining existing row-level security policies.
- Fix Stage 6 analytics/workspace loading: the employees table stores names in `full_name`, not `name`; the incorrect select caused the combined Stage 6 record load to fail.

Apply migration `0009_stage9_audit_log.sql` before using the audit-log view with a fresh production database. The view displays recorded events only; it does not claim all modules currently emit audit events.
