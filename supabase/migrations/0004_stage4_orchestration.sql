-- AutoBusiness Stage 4: durable orchestration control plane.
create table if not exists public.company_ai_budgets (
  company_id uuid primary key references public.companies(id) on delete cascade,
  monthly_limit_usd numeric(12,4) not null default 25 check (monthly_limit_usd >= 0 and monthly_limit_usd <= 100000),
  require_approval boolean not null default true,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_employee_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  goal text not null check (char_length(trim(goal)) between 5 and 3000),
  status text not null default 'queued' check (status in ('queued','awaiting_approval','running','succeeded','retry_wait','failed','cancelled')),
  priority smallint not null default 3 check (priority between 1 and 5),
  scheduled_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_until timestamptz,
  last_error text not null default '' check (char_length(last_error) <= 5000),
  result_summary text not null default '' check (char_length(result_summary) <= 5000),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  actual_cost_usd numeric(12,6) not null default 0 check (actual_cost_usd >= 0),
  idempotency_key text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, idempotency_key)
);
create index if not exists ai_employee_jobs_queue_idx on public.ai_employee_jobs(status, scheduled_at, priority desc, created_at);
create index if not exists ai_employee_jobs_company_idx on public.ai_employee_jobs(company_id, created_at desc);
create table if not exists public.ai_job_approvals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.ai_employee_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decision_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '' check (char_length(decision_note) <= 2000),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.company_ai_budgets enable row level security;
alter table public.ai_employee_jobs enable row level security;
alter table public.ai_job_approvals enable row level security;
drop policy if exists "Company members read AI budgets" on public.company_ai_budgets;
create policy "Company members read AI budgets" on public.company_ai_budgets for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company admins manage AI budgets" on public.company_ai_budgets;
create policy "Company admins manage AI budgets" on public.company_ai_budgets for all to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
drop policy if exists "Company members read AI jobs" on public.ai_employee_jobs;
create policy "Company members read AI jobs" on public.ai_employee_jobs for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members enqueue AI jobs" on public.ai_employee_jobs;
create policy "Company members enqueue AI jobs" on public.ai_employee_jobs for insert to authenticated
with check (requested_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company members update AI jobs" on public.ai_employee_jobs;
create policy "Company members update AI jobs" on public.ai_employee_jobs for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company admins delete AI jobs" on public.ai_employee_jobs;
create policy "Company admins delete AI jobs" on public.ai_employee_jobs for delete to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
drop policy if exists "Company members read AI approvals" on public.ai_job_approvals;
create policy "Company members read AI approvals" on public.ai_job_approvals for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members create AI approvals" on public.ai_job_approvals;
create policy "Company members create AI approvals" on public.ai_job_approvals for insert to authenticated
with check (requested_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company admins decide AI approvals" on public.ai_job_approvals;
create policy "Company admins decide AI approvals" on public.ai_job_approvals for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])))
with check (decision_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
grant select, insert, update, delete on public.company_ai_budgets, public.ai_employee_jobs, public.ai_job_approvals to authenticated;
