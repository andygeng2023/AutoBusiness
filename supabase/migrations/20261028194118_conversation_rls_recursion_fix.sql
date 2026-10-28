create or replace function public.can_access_conversation(target_conversation uuid, target_company uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation
      and c.company_id = target_company
      and public.is_company_member(c.company_id)
      and (
        c.kind = 'group'
        or exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = c.id and cm.user_id = (select auth.uid())
        )
      )
  );
$$;
create or replace function public.can_manage_conversation(target_conversation uuid, target_company uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation
      and c.company_id = target_company
      and public.is_company_member(c.company_id)
      and (c.kind = 'group' or c.created_by = (select auth.uid()))
  );
$$;
revoke all on function public.can_access_conversation(uuid, uuid) from public, anon;
revoke all on function public.can_manage_conversation(uuid, uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid, uuid) to authenticated;
grant execute on function public.can_manage_conversation(uuid, uuid) to authenticated;

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations for select to authenticated
using (public.is_company_member(company_id) and public.can_access_conversation(id, company_id));

drop policy if exists conversation_members_select_member on public.conversation_members;
create policy conversation_members_select_member on public.conversation_members for select to authenticated
using (public.is_company_member(company_id) and public.can_access_conversation(conversation_id, company_id));
drop policy if exists conversation_members_insert_member on public.conversation_members;
create policy conversation_members_insert_member on public.conversation_members for insert to authenticated
with check (
  public.is_company_member(company_id)
  and (user_id is null or user_id = (select auth.uid()))
  and public.can_manage_conversation(conversation_id, company_id)
);

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated
using (public.is_company_member(company_id) and public.can_access_conversation(conversation_id, company_id));
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated
with check (
  public.is_company_member(company_id)
  and (sender_user_id = (select auth.uid()) or sender_employee_id is not null)
  and public.can_access_conversation(conversation_id, company_id)
);
