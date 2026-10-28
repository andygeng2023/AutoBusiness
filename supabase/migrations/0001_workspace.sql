-- AutoBusiness workspace schema. Apply to the intended Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  industry text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create or replace function public.is_company_member(target_company uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = target_company and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.departments(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  role text not null default '',
  tone text not null default 'Clear & concise',
  model text not null default 'Auto',
  custom_instructions text not null default '',
  status text not null default 'available' check (status in ('available','working','needs_review','paused')),
  current_task text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 240),
  description text not null default '',
  status text not null default 'queued' check (status in ('queued','in_progress','submitted','approved','rejected','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  result text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  kind text not null default 'private' check (kind in ('private','group')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  joined_at timestamptz not null default now(),
  check (user_id is not null or employee_id is not null)
);
create unique index if not exists conversation_members_user_unique
  on public.conversation_members(conversation_id, user_id) where user_id is not null;
create unique index if not exists conversation_members_employee_unique
  on public.conversation_members(conversation_id, employee_id) where employee_id is not null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_employee_id uuid references public.employees(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 20000),
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  check (sender_user_id is not null or sender_employee_id is not null)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 180),
  description text not null default '',
  progress numeric not null default 0 check (progress between 0 and 100),
  due_date date,
  status text not null default 'active' check (status in ('planned','active','paused','completed')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  approval_required boolean not null default true,
  auto_run boolean not null default false,
  daily_usage_limit integer not null default 50 check (daily_usage_limit between 1 and 100000),
  monthly_usage_limit integer not null default 900 check (monthly_usage_limit between 1 and 1000000),
  enabled_connectors text[] not null default array['puter']::text[],
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_employee_id uuid references public.employees(id) on delete set null,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists departments_company_idx on public.departments(company_id);
create index if not exists employees_company_department_idx on public.employees(company_id, department_id);
create index if not exists jobs_company_status_created_idx on public.jobs(company_id, status, created_at desc);
create index if not exists conversations_company_created_idx on public.conversations(company_id, created_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists goals_company_status_idx on public.goals(company_id, status);
create index if not exists activity_company_created_idx on public.activity_events(company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.jobs enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.goals enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies for select to authenticated using (public.is_company_member(id));
drop policy if exists companies_insert_owner on public.companies;
create policy companies_insert_owner on public.companies for insert to authenticated with check (created_by = auth.uid());
drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin on public.companies for update to authenticated using (exists(select 1 from public.company_members m where m.company_id = id and m.user_id = auth.uid() and m.role in ('owner','admin'))) with check (public.is_company_member(id));

drop policy if exists company_members_select_member on public.company_members;
create policy company_members_select_member on public.company_members for select to authenticated using (public.is_company_member(company_id));
drop policy if exists company_members_insert_owner on public.company_members;
create policy company_members_insert_owner on public.company_members for insert to authenticated with check (user_id = auth.uid() and exists(select 1 from public.companies c where c.id = company_id and c.created_by = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['departments','employees','jobs','conversations','conversation_members','messages','goals','workspace_settings','activity_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id))', t || '_member_all', t);
  end loop;
end $$;

grant select, insert, update, delete on public.companies, public.company_members, public.departments,
  public.employees, public.jobs, public.conversations, public.conversation_members, public.messages,
  public.goals, public.workspace_settings, public.activity_events to authenticated;

-- A trigger ensures the creator becomes a company owner immediately after creation.
create or replace function public.add_company_creator_as_member()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.company_members(company_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (company_id, user_id) do nothing;
  insert into public.workspace_settings(company_id) values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;
drop trigger if exists companies_add_creator_member on public.companies;
create trigger companies_add_creator_member after insert on public.companies
for each row execute function public.add_company_creator_as_member();
