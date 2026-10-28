-- AutoBusiness Stage 8: measurable company goals and KPI tracking.
create table if not exists public.company_goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  metric_name text not null check (char_length(trim(metric_name)) between 1 and 120),
  unit text not null default '' check (char_length(unit) <= 40),
  baseline_value numeric(14,3) not null default 0,
  current_value numeric(14,3) not null default 0,
  target_value numeric(14,3) not null default 1,
  due_date date,
  status text not null default 'active' check (status in ('planned','active','paused','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_value <> baseline_value)
);
create index if not exists company_goals_company_status_due_idx on public.company_goals(company_id,status,due_date);
alter table public.company_goals enable row level security;
drop policy if exists "Company members read goals" on public.company_goals;
create policy "Company members read goals" on public.company_goals for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members insert goals" on public.company_goals;
create policy "Company members insert goals" on public.company_goals for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company members update goals" on public.company_goals;
create policy "Company members update goals" on public.company_goals for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company admins delete goals" on public.company_goals;
create policy "Company admins delete goals" on public.company_goals for delete to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
grant select,insert,update,delete on public.company_goals to authenticated;
