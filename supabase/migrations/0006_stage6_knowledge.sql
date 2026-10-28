-- AutoBusiness Stage 6: company knowledge library with member-scoped access.
create table if not exists public.company_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 180),
  content text not null check (char_length(content) between 1 and 100000),
  category text not null default 'General' check (char_length(category) between 1 and 80),
  tags text[] not null default '{}',
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_knowledge_company_updated_idx on public.company_knowledge_items(company_id, updated_at desc);
create index if not exists company_knowledge_tags_idx on public.company_knowledge_items using gin(tags);
alter table public.company_knowledge_items enable row level security;
drop policy if exists "Company members read knowledge" on public.company_knowledge_items;
create policy "Company members read knowledge" on public.company_knowledge_items for select to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.is_org_member(c.organisation_id)));
drop policy if exists "Company members add knowledge" on public.company_knowledge_items;
create policy "Company members add knowledge" on public.company_knowledge_items for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company members update knowledge" on public.company_knowledge_items;
create policy "Company members update knowledge" on public.company_knowledge_items for update to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])))
with check (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin','member'])));
drop policy if exists "Company admins delete knowledge" on public.company_knowledge_items;
create policy "Company admins delete knowledge" on public.company_knowledge_items for delete to authenticated
using (exists(select 1 from public.companies c where c.id=company_id and public.has_org_role(c.organisation_id,array['owner','admin'])));
grant select, insert, update, delete on public.company_knowledge_items to authenticated;
