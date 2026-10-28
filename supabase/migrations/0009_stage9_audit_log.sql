-- AutoBusiness Stage 9: improve company-scoped audit-log lookup performance.
-- Existing audit_events policies remain the authorization boundary.
create index if not exists audit_events_company_created_idx
  on public.audit_events (company_id, created_at desc);
alter table public.audit_events enable row level security;
grant select on public.audit_events to authenticated;
