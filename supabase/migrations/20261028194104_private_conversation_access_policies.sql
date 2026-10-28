-- Private employee conversations are visible only to their human participants.
drop policy if exists conversations_member_all on public.conversations;
drop policy if exists conversations_select_member on public.conversations;
drop policy if exists conversations_insert_member on public.conversations;
create policy conversations_select_member on public.conversations for select to authenticated
using (
  public.is_company_member(company_id)
  and (
    kind = 'group'
    or exists (
      select 1 from public.conversation_members cm
      where cm.company_id = conversations.company_id
        and cm.conversation_id = conversations.id
        and cm.user_id = (select auth.uid())
    )
  )
);
create policy conversations_insert_member on public.conversations for insert to authenticated
with check (public.is_company_member(company_id) and created_by = (select auth.uid()));

drop policy if exists conversation_members_member_all on public.conversation_members;
drop policy if exists conversation_members_select_member on public.conversation_members;
drop policy if exists conversation_members_insert_member on public.conversation_members;
create policy conversation_members_select_member on public.conversation_members for select to authenticated
using (
  public.is_company_member(company_id)
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_members.conversation_id
      and c.company_id = conversation_members.company_id
      and (
        c.kind = 'group'
        or exists (
          select 1 from public.conversation_members mine
          where mine.conversation_id = c.id and mine.user_id = (select auth.uid())
        )
      )
  )
);
create policy conversation_members_insert_member on public.conversation_members for insert to authenticated
with check (
  public.is_company_member(company_id)
  and (user_id is null or user_id = (select auth.uid()))
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_members.conversation_id
      and c.company_id = conversation_members.company_id
      and (c.kind = 'group' or c.created_by = (select auth.uid()))
  )
);

drop policy if exists messages_member_all on public.messages;
drop policy if exists messages_select_member on public.messages;
drop policy if exists messages_insert_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated
using (
  public.is_company_member(company_id)
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.company_id = messages.company_id
      and (
        c.kind = 'group'
        or exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = c.id and cm.user_id = (select auth.uid())
        )
      )
  )
);
create policy messages_insert_member on public.messages for insert to authenticated
with check (
  public.is_company_member(company_id)
  and (sender_user_id = (select auth.uid()) or sender_employee_id is not null)
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.company_id = messages.company_id
      and (
        c.kind = 'group'
        or exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = c.id and cm.user_id = (select auth.uid())
        )
      )
  )
);

revoke update, delete on public.conversations, public.conversation_members, public.messages from authenticated;
grant select, insert on public.conversations, public.conversation_members, public.messages to authenticated;
