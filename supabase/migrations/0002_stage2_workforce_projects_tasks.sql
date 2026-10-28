-- AutoBusiness Stage 2: departments, employee profiles, projects and tasks.
-- Company-scoped records inherit organisation membership from Stage 1.
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text,
  role_title text not null default 'Team member' check (char_length(role_title) <= 120),
  employment_type text not null default 'human' check (employment_type in ('human','ai')),
  status text not null default 'active' check (status in ('active','inactive','planned')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  start_date date,
  due_date date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departments_company_idx on public.departments(company_id);
create index if not exists employees_company_status_idx on public.employees(company_id, status);
create index if not exists projects_company_status_idx on public.projects(company_id, status);
create index if not exists tasks_company_status_due_idx on public.tasks(company_id, status, due_date);
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assigned_employee_id);

alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "Company members read departments" on public.departments;
drop policy if exists "Company editors manage departments" on public.departments;
drop policy if exists "Company editors insert departments" on public.departments;
drop policy if exists "Company editors update departments" on public.departments;
drop policy if exists "Company admins delete departments" on public.departments;
create policy "Company members read departments" on public.departments for select to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.is_org_member(c.organisation_id)));
create policy "Company editors insert departments" on public.departments for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company editors update departments" on public.departments for update to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])))
with check (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company admins delete departments" on public.departments for delete to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin'])));

drop policy if exists "Company members read employees" on public.employees;
drop policy if exists "Company editors manage employees" on public.employees;
drop policy if exists "Company editors insert employees" on public.employees;
drop policy if exists "Company editors update employees" on public.employees;
drop policy if exists "Company admins delete employees" on public.employees;
create policy "Company members read employees" on public.employees for select to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.is_org_member(c.organisation_id)));
create policy "Company editors insert employees" on public.employees for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company editors update employees" on public.employees for update to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])))
with check (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company admins delete employees" on public.employees for delete to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin'])));

drop policy if exists "Company members read projects" on public.projects;
drop policy if exists "Company editors manage projects" on public.projects;
drop policy if exists "Company editors insert projects" on public.projects;
drop policy if exists "Company editors update projects" on public.projects;
drop policy if exists "Company admins delete projects" on public.projects;
create policy "Company members read projects" on public.projects for select to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.is_org_member(c.organisation_id)));
create policy "Company editors insert projects" on public.projects for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company editors update projects" on public.projects for update to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])))
with check (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company admins delete projects" on public.projects for delete to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin'])));

drop policy if exists "Company members read tasks" on public.tasks;
drop policy if exists "Company editors manage tasks" on public.tasks;
drop policy if exists "Company editors insert tasks" on public.tasks;
drop policy if exists "Company editors update tasks" on public.tasks;
drop policy if exists "Company admins delete tasks" on public.tasks;
create policy "Company members read tasks" on public.tasks for select to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.is_org_member(c.organisation_id)));
create policy "Company editors insert tasks" on public.tasks for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company editors update tasks" on public.tasks for update to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])))
with check (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin','member'])));
create policy "Company admins delete tasks" on public.tasks for delete to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and public.has_org_role(c.organisation_id, array['owner','admin'])));

grant select, insert, update, delete on public.departments, public.employees, public.projects, public.tasks to authenticated;
