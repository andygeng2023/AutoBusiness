export type Company = {
  id: string;
  name: string;
  industry: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
};

export type WorkspaceData = {
  companies: Company[];
  activeCompanyId: string | null;
  events: AuditEvent[];
};

export type AppUser = {
  id: string;
  email: string | null;
};