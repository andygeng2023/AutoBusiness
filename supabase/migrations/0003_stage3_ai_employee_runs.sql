-- AutoBusiness Stage 3: auditable, user-initiated AI employee runs.
create table if not exists public.ai_employee_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  goal text not null check (char_length(trim(goal)) between 5 and 3000),
  status text not null default 'planned' check (status in ('planned','approved','completed','failed','cancelled')),
  plan jsonb not null default '{}'::jsonb,
  result_summary text not null default '' check (char_length(result_summary) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_employee_runs_company_created_idx on public.ai_employee_runs(company_id, created_at desc);
create index if not exists ai_employee_runs_employee_created_idx on public.ai_employee_runs(employee_id, created_at desc);
alter table public.ai_employee_runs enable row level security;
drop policy if exists "Company members read AI runs" on public.ai_employee_runs;
drop policy if exists "Company members create AI runs" on public.ai_employee_runs;
drop policy if exists "Company members update AI runs" on public.ai_employee_runs;
drop policy if exists "Company admins delete AI runs" on public.ai_employee_runs;
create policy "Company members read AI runs" on public.ai_employee_runs for select to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.is_org_member(c.organisation_id)));
create policy "Company members create AI runs" on public.ai_employee_runs for insert to authenticated
with check (requested_by = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company members update AI runs" on public.ai_employee_runs for update to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])))
with check (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company admins delete AI runs" on public.ai_employee_runs for delete to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin'])));
grant select, insert, update, delete on public.ai_employee_runs to authenticated;
