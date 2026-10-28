create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invited_email text not null check (char_length(trim(invited_email)) between 3 and 320),
  role text not null default 'member' check (role in ('admin','member')),
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_invites_company_created_idx on public.company_invites(company_id, created_at desc);
alter table public.company_invites enable row level security;
revoke all on public.company_invites from anon, public;
grant select, insert, delete on public.company_invites to authenticated;
drop policy if exists company_invites_admin_select on public.company_invites;
create policy company_invites_admin_select on public.company_invites for select to authenticated
using (exists (select 1 from public.company_members m where m.company_id = company_invites.company_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));
drop policy if exists company_invites_admin_insert on public.company_invites;
create policy company_invites_admin_insert on public.company_invites for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.company_members m where m.company_id = company_invites.company_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));
drop policy if exists company_invites_admin_delete on public.company_invites;
create policy company_invites_admin_delete on public.company_invites for delete to authenticated
using (exists (select 1 from public.company_members m where m.company_id = company_invites.company_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));

create or replace function public.accept_company_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.company_invites%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'You must sign in before accepting an invitation';
  end if;

  select * into invite_row
  from public.company_invites i
  where i.token_hash = p_token_hash
    and lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'This invitation is invalid, expired, already used, or belongs to a different email address';
  end if;

  insert into public.company_members(company_id, user_id, role)
  values (invite_row.company_id, (select auth.uid()), invite_row.role)
  on conflict (company_id, user_id) do nothing;

  update public.company_invites
  set accepted_at = now(), accepted_by = (select auth.uid())
  where id = invite_row.id;

  return invite_row.company_id;
end;
$$;
revoke all on function public.accept_company_invite(text) from public, anon;
grant execute on function public.accept_company_invite(text) to authenticated;
