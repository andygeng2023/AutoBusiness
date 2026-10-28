-- AutoBusiness Stage 5: company-scoped tool permissions, saved deliverables, and publishing approvals.
create table if not exists public.company_integrations (
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_key text not null check (provider_key in ('github','browser','documents','publishing','drive','slack')),
  status text not null default 'disabled' check (status in ('enabled','disabled')),
  enabled_scopes text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, provider_key)
);
create table if not exists public.company_deliverables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 160),
  kind text not null check (kind in ('document','report','research','implementation','content')),
  content text not null check (char_length(content) between 1 and 200000),
  status text not null default 'ready' check (status in ('draft','ready','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_deliverables_company_idx on public.company_deliverables(company_id, created_at desc);
create table if not exists public.publishing_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deliverable_id uuid not null references public.company_deliverables(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  destination_key text not null check (destination_key in ('website','github-pages','github-release','other')),
  destination_url text not null default '' check (char_length(destination_url) <= 2048),
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval','approved','published','rejected','failed')),
  scheduled_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists publishing_workflows_company_idx on public.publishing_workflows(company_id, created_at desc);
alter table public.company_integrations enable row level security;
alter table public.company_deliverables enable row level security;
alter table public.publishing_workflows enable row level security;
drop policy if exists "Company members read integration permissions" on public.company_integrations;
create policy "Company members read integration permissions" on public.company_integrations for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company admins manage integration permissions" on public.company_integrations;
create policy "Company admins manage integration permissions" on public.company_integrations for all to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
drop policy if exists "Company members read deliverables" on public.company_deliverables;
create policy "Company members read deliverables" on public.company_deliverables for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members create deliverables" on public.company_deliverables;
create policy "Company members create deliverables" on public.company_deliverables for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company members update deliverables" on public.company_deliverables;
create policy "Company members update deliverables" on public.company_deliverables for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company admins delete deliverables" on public.company_deliverables;
create policy "Company admins delete deliverables" on public.company_deliverables for delete to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
drop policy if exists "Company members read publishing workflows" on public.publishing_workflows;
create policy "Company members read publishing workflows" on public.publishing_workflows for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members request publication" on public.publishing_workflows;
create policy "Company members request publication" on public.publishing_workflows for insert to authenticated
with check (created_by=(select auth.uid()) and status='awaiting_approval' and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])) and exists(select 1 from public.company_deliverables d where d.id=deliverable_id and d.company_id=company_id));
drop policy if exists "Company admins review publishing workflows" on public.publishing_workflows;
create policy "Company admins review publishing workflows" on public.publishing_workflows for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
grant select, insert, update, delete on public.company_integrations, public.company_deliverables, public.publishing_workflows to authenticated;
