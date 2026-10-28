-- AutoBusiness Stage 7: company-scoped manual automation rules and execution history.
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  trigger_type text not null default 'manual' check (trigger_type in ('manual')),
  action_type text not null default 'create_task' check (action_type in ('create_task')),
  action_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz
);
create index if not exists automation_rules_company_created_idx on public.automation_rules(company_id, created_at desc);
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  output text not null default '' check (char_length(output) <= 3000),
  error text not null default '' check (char_length(error) <= 3000),
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists automation_runs_company_started_idx on public.automation_runs(company_id, started_at desc);
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
drop policy if exists "Company members read automation rules" on public.automation_rules;
create policy "Company members read automation rules" on public.automation_rules for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members insert automation rules" on public.automation_rules;
create policy "Company members insert automation rules" on public.automation_rules for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company members update automation rules" on public.automation_rules;
create policy "Company members update automation rules" on public.automation_rules for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company admins delete automation rules" on public.automation_rules;
create policy "Company admins delete automation rules" on public.automation_rules for delete to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
drop policy if exists "Company members read automation runs" on public.automation_runs;
create policy "Company members read automation runs" on public.automation_runs for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members create automation runs" on public.automation_runs;
create policy "Company members create automation runs" on public.automation_runs for insert to authenticated
with check ((started_by is null or started_by=(select auth.uid())) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company members update automation runs" on public.automation_runs;
create policy "Company members update automation runs" on public.automation_runs for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
grant select, insert, update, delete on public.automation_rules to authenticated;
grant select, insert, update on public.automation_runs to authenticated;
