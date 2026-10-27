-- AutoBusiness Stage 1: company workspace foundation.
-- Apply with Supabase CLI or the SQL editor. Never expose service-role keys in the browser.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  industry text not null default 'Other',
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_organisation_created_idx
  on public.companies (organisation_id, created_at desc);
create index if not exists organisation_members_user_idx
  on public.organisation_members (user_id, organisation_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  summary text not null check (char_length(summary) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_org_created_idx
  on public.audit_events (organisation_id, created_at desc);

-- SECURITY DEFINER helpers avoid recursive RLS checks on organisation_members.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_members m
    where m.organisation_id = target_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_members m
    where m.organisation_id = target_org
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.companies enable row level security;
alter table public.audit_events enable row level security;

create policy "Members can read their organisations"
on public.organisations for select to authenticated
using (public.is_org_member(id));

create policy "Authenticated users can create an organisation for themselves"
on public.organisations for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "Owners and admins can update organisations"
on public.organisations for update to authenticated
using (public.has_org_role(id, array['owner','admin']))
with check (public.has_org_role(id, array['owner','admin']));

create policy "Members can read organisation membership"
on public.organisation_members for select to authenticated
using (public.is_org_member(organisation_id));

-- Membership creation is intentionally not open to clients. Add a server-side
-- onboarding transaction/RPC before enabling organisation creation in production.
create policy "Owners can manage membership"
on public.organisation_members for all to authenticated
using (public.has_org_role(organisation_id, array['owner']))
with check (public.has_org_role(organisation_id, array['owner']));

create policy "Members can read company records"
on public.companies for select to authenticated
using (public.is_org_member(organisation_id));

create policy "Editors can create companies"
on public.companies for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_org_role(organisation_id, array['owner','admin','member'])
);

create policy "Editors can update company records"
on public.companies for update to authenticated
using (public.has_org_role(organisation_id, array['owner','admin','member']))
with check (public.has_org_role(organisation_id, array['owner','admin','member']));

create policy "Owners and admins can delete company records"
on public.companies for delete to authenticated
using (public.has_org_role(organisation_id, array['owner','admin']));

create policy "Members can read audit events"
on public.audit_events for select to authenticated
using (public.is_org_member(organisation_id));

-- Client roles cannot alter or delete audit history. Insert is intentionally
-- restricted until trusted server-side event writing is added.
revoke insert, update, delete on public.audit_events from anon, authenticated;

-- Create the organisation, owner membership, company, and initial audit event
-- in one trusted transaction. The browser never gets direct membership-write access.
create or replace function public.create_company_workspace(
  company_name text,
  company_industry text default 'Other',
  company_description text default ''
)
returns setof public.companies
language plpgsql
security definer
set search_path = ''
as $
declare
  new_org_id uuid;
  new_company public.companies;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(trim(company_name)) < 2 or char_length(trim(company_name)) > 80 then
    raise exception 'Company name must be between 2 and 80 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(company_description, '')) > 500 then
    raise exception 'Company description must be 500 characters or fewer' using errcode = '22023';
  end if;

  insert into public.organisations (name, created_by)
  values (trim(company_name), current_user_id)
  returning id into new_org_id;

  insert into public.organisation_members (organisation_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  insert into public.companies (
    organisation_id, name, industry, description, created_by
  ) values (
    new_org_id,
    trim(company_name),
    coalesce(nullif(trim(company_industry), ''), 'Other'),
    coalesce(trim(company_description), ''),
    current_user_id
  )
  returning * into new_company;

  insert into public.audit_events (
    organisation_id, company_id, actor_id, action, summary
  ) values (
    new_org_id, new_company.id, current_user_id, 'company.created',
    'Created ' || new_company.name
  );

  return next new_company;
end;
$;

revoke all on function public.create_company_workspace(text, text, text) from public, anon;
grant execute on function public.create_company_workspace(text, text, text) to authenticated;
