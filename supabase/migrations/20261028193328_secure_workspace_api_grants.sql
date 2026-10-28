-- The browser client uses the publishable key; all workspace data must require an authenticated, authorised member.
revoke all on public.companies, public.company_members, public.departments, public.employees,
  public.jobs, public.conversations, public.conversation_members, public.messages,
  public.goals, public.workspace_settings, public.activity_events from anon, public;

grant select, insert, update, delete on public.companies, public.company_members, public.departments,
  public.employees, public.jobs, public.conversations, public.conversation_members, public.messages,
  public.goals, public.workspace_settings, public.activity_events to authenticated;

-- Trigger functions are invoked by PostgreSQL triggers; they should not be callable as RPC endpoints.
revoke all on function public.add_company_creator_as_member() from public, anon, authenticated;

-- The membership helper is needed by RLS policies, but only authenticated sessions should call it.
revoke all on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;
