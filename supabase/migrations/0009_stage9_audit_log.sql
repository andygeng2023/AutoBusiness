-- AutoBusiness Stage 9: improve company-scoped audit-log lookup performance.
-- Existing audit_events policies remain the authorization boundary.
create index if not exists audit_events_company_created_idx
  on public.audit_events (company_id, created_at desc);
alter table public.audit_events enable row level security;
grant select on public.audit_events to authenticated;

-- Membership helpers are used by authenticated RLS policies; they need not be callable by anonymous clients.
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, text[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
