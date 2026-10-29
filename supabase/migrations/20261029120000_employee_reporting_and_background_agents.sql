-- Employee reporting hierarchy and safeguards for recursive department trees.
alter table public.employees
  add column if not exists manager_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_manager_id_fkey'
  ) then
    alter table public.employees
      add constraint employees_manager_id_fkey
      foreign key (manager_id) references public.employees(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_manager_not_self'
  ) then
    alter table public.employees
      add constraint employees_manager_not_self
      check (manager_id is null or manager_id <> id);
  end if;
end $$;

create index if not exists employees_company_manager_idx
  on public.employees(company_id, manager_id);

create or replace function public.validate_employee_manager_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creates_cycle boolean := false;
begin
  if new.manager_id is null then
    return new;
  end if;

  if new.manager_id = new.id then
    raise exception 'An employee cannot manage themselves';
  end if;

  if not exists (
    select 1 from public.employees manager
    where manager.id = new.manager_id
      and manager.company_id = new.company_id
  ) then
    raise exception 'The manager must belong to the same company';
  end if;

  with recursive manager_chain(id, manager_id, path) as (
    select e.id, e.manager_id, array[e.id]
    from public.employees e
    where e.id = new.manager_id and e.company_id = new.company_id
    union all
    select parent.id, parent.manager_id, chain.path || parent.id
    from public.employees parent
    join manager_chain chain on parent.id = chain.manager_id
    where parent.company_id = new.company_id
      and not parent.id = any(chain.path)
  )
  select exists(select 1 from manager_chain where id = new.id)
    into creates_cycle;

  if creates_cycle then
    raise exception 'This reporting line would create a management cycle';
  end if;

  return new;
end;
$$;

drop trigger if exists employees_validate_manager_link on public.employees;
create trigger employees_validate_manager_link
before insert or update on public.employees
for each row execute function public.validate_employee_manager_link();

create or replace function public.validate_department_parent_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creates_cycle boolean := false;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A department cannot be its own parent';
  end if;

  if not exists (
    select 1 from public.departments parent
    where parent.id = new.parent_id
      and parent.company_id = new.company_id
  ) then
    raise exception 'The parent department must belong to the same company';
  end if;

  with recursive parent_chain(id, parent_id, path) as (
    select d.id, d.parent_id, array[d.id]
    from public.departments d
    where d.id = new.parent_id and d.company_id = new.company_id
    union all
    select parent.id, parent.parent_id, chain.path || parent.id
    from public.departments parent
    join parent_chain chain on parent.id = chain.parent_id
    where parent.company_id = new.company_id
      and not parent.id = any(chain.path)
  )
  select exists(select 1 from parent_chain where id = new.id)
    into creates_cycle;

  if creates_cycle then
    raise exception 'This department would create a hierarchy cycle';
  end if;

  return new;
end;
$$;

drop trigger if exists departments_validate_parent_link on public.departments;
create trigger departments_validate_parent_link
before insert or update on public.departments
for each row execute function public.validate_department_parent_link();

-- Autonomous collaboration is opt-out, but still requires an OpenRouter key
-- and an open authenticated workspace in the current static client.
alter table public.workspace_settings
  alter column auto_run set default true;

update public.workspace_settings
set auto_run = true
where auto_run = false;
