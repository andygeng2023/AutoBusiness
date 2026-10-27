import type { AuditEvent, Company, WorkspaceData } from '../types';

const STORAGE_KEY = 'autobusiness-stage1-workspace-v1';

export const emptyWorkspace = (): WorkspaceData => ({
  companies: [],
  activeCompanyId: null,
  events: [],
});

export function readDemoWorkspace(): WorkspaceData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw) as Partial<WorkspaceData>;
    return {
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      activeCompanyId: typeof parsed.activeCompanyId === 'string' ? parsed.activeCompanyId : null,
      events: Array.isArray(parsed.events) ? parsed.events.slice(0, 100) : [],
    };
  } catch {
    return emptyWorkspace();
  }
}

export function writeDemoWorkspace(data: WorkspaceData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...data,
    events: data.events.slice(0, 100),
  }));
}

export function createAuditEvent(action: string, summary: string): AuditEvent {
  return { id: crypto.randomUUID(), action, summary, createdAt: new Date().toISOString() };
}

export function upsertCompany(companies: Company[], company: Company): Company[] {
  const exists = companies.some((item) => item.id === company.id);
  return exists
    ? companies.map((item) => item.id === company.id ? company : item)
    : [company, ...companies];
}