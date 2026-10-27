import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bot, Building2, Check, ChevronDown,
  CircleHelp, Command, CreditCard, FileText, FolderKanban, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { INDUSTRIES, makeCompany, validateCompanyName } from './lib/company';
import { createAuditEvent, emptyWorkspace, readDemoWorkspace, writeDemoWorkspace } from './lib/workspace';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { puterChat } from './lib/puter';
import type { AppUser, Company, WorkspaceData } from './types';

type Page = 'Overview' | 'Companies' | 'Employees' | 'Departments' | 'Projects' | 'Operations' | 'Knowledge' | 'Approvals' | 'Analytics' | 'Integrations' | 'Settings';

const navigation: { label: Page; icon: typeof LayoutDashboard; group: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { label: 'Companies', icon: Building2, group: 'WORKSPACE' },
  { label: 'Employees', icon: Users, group: 'MANAGEMENT' },
  { label: 'Departments', icon: FolderKanban, group: 'MANAGEMENT' },
  { label: 'Projects', icon: FileText, group: 'MANAGEMENT' },
  { label: 'Operations', icon: Activity, group: 'MANAGEMENT' },
  { label: 'Knowledge', icon: FileText, group: 'RESOURCES' },
  { label: 'Approvals', icon: ShieldCheck, group: 'RESOURCES' },
  { label: 'Analytics', icon: ArrowUpRight, group: 'RESOURCES' },
  { label: 'Integrations', icon: Sparkles, group: 'ADMINISTRATION' },
  { label: 'Settings', icon: Settings2, group: 'ADMINISTRATION' },
];

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => readDemoWorkspace());
  const [page, setPage] = useState<Page>('Overview');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [dataError, setDataError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [settingsName, setSettingsName] = useState('');

  const activeCompany = useMemo(
    () => workspace.companies.find((company) => company.id === workspace.activeCompanyId) ?? workspace.companies[0] ?? null,
    [workspace],
  );
  const demoMode = !isSupabaseConfigured;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email ?? null } : null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ? { id: nextSession.user.id, email: nextSession.user.email ?? null } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (demoMode) {
      writeDemoWorkspace(workspace);
      return;
    }
    if (!user || !supabase) {
      setWorkspace(emptyWorkspace());
      return;
    }
    let cancelled = false;
    (async () => {
      setDataError('');
      const { data, error } = await supabase
        .from('companies')
        .select('id,name,industry,description,created_at,updated_at')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setDataError(error.message);
        return;
      }
      const companies: Company[] = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        industry: row.industry ?? 'Other',
        description: row.description ?? '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      setWorkspace((current) => ({
        ...current,
        companies,
        activeCompanyId: companies.some((c) => c.id === current.activeCompanyId) ? current.activeCompanyId : companies[0]?.id ?? null,
      }));
    })();
    return () => { cancelled = true; };
  }, [demoMode, user, session]);

  useEffect(() => {
    setSettingsName(activeCompany?.name ?? '');
  }, [activeCompany?.id, activeCompany?.name]);


  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const result = authMode === 'signup'
        ? await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) {
        setAuthMessage('Check your email to confirm your account, then sign in.');
      } else {
        setAuthMessage('Signed in successfully.');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setWorkspace(emptyWorkspace());
  }

  async function submitCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const validation = validateCompanyName(companyName);
    if (validation) { setFormError(validation); return; }
    const company = makeCompany({ name: companyName, industry, description });
    if (!demoMode) {
      if (!supabase || !user) {
        setFormError('Sign in before creating a company.');
        return;
      }
      const { data, error } = await supabase.rpc('create_company_workspace', {
        company_name: company.name,
        company_industry: company.industry,
        company_description: company.description,
      }).select('id,name,industry,description,created_at,updated_at').single();
      if (error) { setFormError(error.message); return; }
      const saved: Company = {
        id: data.id, name: data.name, industry: data.industry ?? 'Other',
        description: data.description ?? '', createdAt: data.created_at, updatedAt: data.updated_at,
      };
      setWorkspace((current) => ({ ...current, companies: [saved, ...current.companies], activeCompanyId: saved.id }));
      setCreateOpen(false);
      setCompanyName(''); setDescription('');
      setPage('Overview');
      return;
    }
    setWorkspace((current) => ({
      ...current,
      companies: [company, ...current.companies],
      activeCompanyId: company.id,
      events: [createAuditEvent('company.created', `Created ${company.name}`), ...current.events].slice(0, 100),
    }));
    setCreateOpen(false);
    setCompanyName(''); setDescription('');
    setPage('Overview');
  }

  async function generateDescription() {
    if (companyName.trim().length < 2) {
      setAiError('Enter a company name first.');
      return;
    }
    setAiBusy(true);
    setAiError('');
    try {
      const response = await puterChat(
        `Write a concise, professional company description in 1–2 sentences. Company name: ${companyName.trim()}. Industry: ${industry}. Return only the description, no quotation marks or headings.`,
        { model: 'gpt-5.4-nano' },
      );
      const content = typeof response === 'string'
        ? response
        : (response as { message?: { content?: unknown } })?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('The AI returned an empty description. Please try again.');
      }
      setDescription(content.trim().slice(0, 500));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Could not generate a description with Puter.');
    } finally {
      setAiBusy(false);
    }
  }

  async function saveCompanySettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompany) return;
    const validation = validateCompanyName(settingsName);
    if (validation) { setDataError(validation); return; }
    if (!demoMode && supabase) {
      const { error } = await supabase.from('companies').update({ name: settingsName.trim() }).eq('id', activeCompany.id);
      if (error) { setDataError(error.message); return; }
    }
    setWorkspace((current) => ({
      ...current,
      companies: current.companies.map((company) => company.id === activeCompany.id
        ? { ...company, name: settingsName.trim(), updatedAt: new Date().toISOString() }
        : company),
      events: [createAuditEvent('company.updated', `Updated settings for ${settingsName.trim()}`), ...current.events].slice(0, 100),
    }));
    setDataError('');
  }

  const filteredCompanies = workspace.companies.filter((company) =>
    company.name.toLowerCase().includes(query.toLowerCase()) ||
    company.industry.toLowerCase().includes(query.toLowerCase()),
  );

  if (!demoMode && !user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark"><Building2 size={23} /></div>
          <p className="eyebrow">AUTOBUSINESS WORKSPACE</p>
          <h1>{authMode === 'signin' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p className="muted">A clear home for your company, projects and future AI workforce.</p>
          <form className="stack-form" onSubmit={submitAuth}>
            <label>Email address<input type="email" autoComplete="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required placeholder="you@example.com" /></label>
            <label>Password<input type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" /></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            {authMessage && <p className="form-success" role="status">{authMessage}</p>}
            <button className="primary-button full-button" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="text-button" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); setAuthMessage(''); }}>
            {authMode === 'signin' ? 'New here? Create an account' : 'Already registered? Sign in'}
          </button>
          <p className="tiny muted">Authentication is handled by your configured Supabase project.</p>
        </section>
      </main>
    );
  }

  const groupedNav = ['WORKSPACE', 'MANAGEMENT', 'RESOURCES', 'ADMINISTRATION'];

  return (
    <div className="app-shell">
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Building2 size={21} /></div>
          <div className="brand-name">Auto<span>Business</span><small>COMPANY OS</small></div>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <button className="company-switcher" onClick={() => setPage('Companies')}>
          <span className="company-avatar">{activeCompany ? initials(activeCompany.name) : 'AB'}</span>
          <span className="switcher-copy"><strong>{activeCompany?.name ?? 'Your workspace'}</strong><small>{activeCompany ? activeCompany.industry : 'Set up your first company'}</small></span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-scroll">
          {groupedNav.map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-heading">{group}</p>
              {navigation.filter((item) => item.group === group).map(({ label, icon: Icon }) => (
                <button key={label} className={`nav-item ${page === label ? 'nav-active' : ''}`} onClick={() => { setPage(label); setMobileNav(false); }}>
                  <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                  {label === 'Approvals' && <span className="nav-count">0</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="help-card"><CircleHelp size={17} /><div><strong>Getting started</strong><small>Set up your company</small></div><ArrowDownRight size={15} /></div>
          <div className="profile-row">
            <div className="profile-avatar">{initials(user?.email ?? 'Demo User')}</div>
            <div className="profile-copy"><strong>{demoMode ? 'Demo workspace' : user?.email ?? 'Account'}</strong><small>{demoMode ? 'Local demo mode' : 'Authenticated'}</small></div>
            {!demoMode && <button className="icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={16} /></button>}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={19} /></button><span>Workspace</span><span className="crumb-separator">/</span><strong>{page}</strong></div>
          <div className="topbar-actions">
            <div className="mode-chip"><span className={`status-dot ${demoMode ? 'status-demo' : ''}`} />{demoMode ? 'Demo mode' : 'Connected'}</div>
            <button className="icon-button" aria-label="Command menu" title="Command menu"><Command size={17} /></button>
            <button className="primary-button top-create" onClick={() => setCreateOpen(true)}><Plus size={16} /> New company</button>
          </div>
        </header>

        <div className="page-content">
          {dataError && <div className="notice notice-error" role="alert">{dataError}</div>}
          {demoMode && <div className="notice notice-demo"><Sparkles size={16} /><span><strong>Preview workspace.</strong> Data is saved in this browser only. Configure Supabase for authenticated, shared company data.</span></div>}

          {page === 'Overview' && (
            <>
              <section className="welcome-row">
                <div><p className="eyebrow">COMPANY HQ</p><h1>{activeCompany ? `Welcome to ${activeCompany.name}` : 'Build your company workspace'}</h1><p className="muted">{activeCompany ? activeCompany.description || 'Your company workspace is ready for its first projects and employees.' : 'Create a company to give your projects, people and operations a home.'}</p></div>
                <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Create company</button>
              </section>
              <section className="metric-grid">
                <Metric icon={Building2} label="Companies" value={String(workspace.companies.length)} detail="Workspaces created" />
                <Metric icon={Users} label="AI employees" value="0" detail="Ready to add in Stage 2" />
                <Metric icon={FolderKanban} label="Active projects" value="0" detail="Project management is next" />
                <Metric icon={CreditCard} label="AI spend" value="€0.00" detail="No AI calls in Stage 1" />
              </section>
              <section className="content-grid">
                <div className="panel company-panel">
                  <div className="panel-header"><div><h2>Your companies</h2><p>Switch between your company workspaces.</p></div><button className="subtle-button" onClick={() => setPage('Companies')}>View all <ArrowUpRight size={14} /></button></div>
                  {workspace.companies.length === 0 ? <EmptyState onCreate={() => setCreateOpen(true)} /> : <div className="company-list">{workspace.companies.slice(0, 4).map((company) => <button className={`company-list-item ${activeCompany?.id === company.id ? 'selected-company' : ''}`} key={company.id} onClick={() => setWorkspace((current) => ({ ...current, activeCompanyId: company.id }))}><span className="company-avatar large">{initials(company.name)}</span><span className="company-list-copy"><strong>{company.name}</strong><small>{company.industry}</small></span>{activeCompany?.id === company.id && <Check size={17} className="selected-check" />}</button>)}</div>}
                  <div className="panel-footer"><span className="muted tiny">{workspace.companies.length} {workspace.companies.length === 1 ? 'company' : 'companies'} in this workspace</span><button className="text-button" onClick={() => setCreateOpen(true)}>Add company <Plus size={14} /></button></div>
                </div>
                <div className="panel activity-panel">
                  <div className="panel-header"><div><h2>Recent activity</h2><p>Changes in your workspace.</p></div><Activity size={17} className="muted-icon" /></div>
                  {workspace.events.length === 0 ? <div className="activity-empty"><div className="empty-icon"><Activity size={20} /></div><strong>No activity yet</strong><p>Create your first company to start the activity history.</p></div> : <div className="activity-list">{workspace.events.slice(0, 6).map((event) => <div className="activity-item" key={event.id}><span className="activity-marker"><Check size={12} /></span><div><strong>{event.summary}</strong><small>{event.action} · {timeLabel(event.createdAt)}</small></div></div>)}</div>}
                </div>
              </section>
              <section className="next-panel"><div className="next-icon"><Bot size={21} /></div><div className="next-copy"><span className="eyebrow">COMING NEXT</span><h2>Your AI workforce, connected to real work</h2><p>Stage 2 will add employee profiles, departments, task assignment and project tracking. Puter AI calls are intentionally disabled in this foundation stage.</p></div><span className="stage-pill">Stage 2</span></section>
            </>
          )}

          {page === 'Companies' && <section className="subpage"><div className="subpage-heading"><div><p className="eyebrow">WORKSPACE DIRECTORY</p><h1>Companies</h1><p className="muted">Create and manage separate company workspaces.</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} /> New company</button></div><div className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies…" aria-label="Search companies" /></div>{filteredCompanies.length === 0 ? <EmptyState onCreate={() => setCreateOpen(true)} /> : <div className="directory-grid">{filteredCompanies.map((company) => <button key={company.id} className="directory-card" onClick={() => { setWorkspace((current) => ({ ...current, activeCompanyId: company.id })); setPage('Overview'); }}><div className="directory-card-top"><span className="company-avatar large">{initials(company.name)}</span><span className="directory-open">Open <ArrowUpRight size={14} /></span></div><h3>{company.name}</h3><p>{company.industry}</p><small>{company.description || 'No description added'}</small></button>)}</div>}</section>}

          {page === 'Settings' && <section className="subpage"><div className="subpage-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Company settings</h1><p className="muted">Manage the selected company's basic information.</p></div></div>{activeCompany ? <form className="panel settings-form" onSubmit={saveCompanySettings}><label>Company name<input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} maxLength={80} required /></label><label>Industry<input value={activeCompany.industry} readOnly /></label><label>Description<textarea value={activeCompany.description} readOnly rows={3} /><small>Editing descriptions will be added with the full company profile editor.</small></label><button className="primary-button" type="submit">Save changes</button></form> : <EmptyState onCreate={() => setCreateOpen(true)} />}</section>}

          {!['Overview', 'Companies', 'Settings'].includes(page) && <section className="subpage"><div className="subpage-heading"><div><p className="eyebrow">AUTOBUSINESS</p><h1>{page}</h1><p className="muted">This workspace section is planned for a later implementation stage.</p></div></div><div className="panel roadmap-card"><div className="roadmap-icon"><Bot size={24} /></div><h2>{page} is on the roadmap</h2><p>The Stage 1 foundation is in place. This section will connect to the shared company and permission model as its feature set is implemented.</p><div className="roadmap-note"><ShieldCheck size={17} /><span>Company data access and audit foundations are being established before autonomous actions are enabled.</span></div></div></section>}
          <footer className="page-footer"><span>AutoBusiness <span className="footer-separator">·</span> Stage 1 foundation</span><span><span className="status-dot" /> {demoMode ? 'Browser-local demo' : 'Supabase connected'}</span></footer>
        </div>
      </main>

      {createOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-header"><div><p className="eyebrow">NEW WORKSPACE</p><h2 id="create-title">Create a company</h2><p className="muted">Start with the basics. You can expand the company later.</p></div><button className="icon-button" aria-label="Close dialog" onClick={() => setCreateOpen(false)}><X size={18} /></button></div><form className="stack-form" onSubmit={submitCompany}><label>Company name <span className="required">*</span><input autoFocus value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Northstar Studio" maxLength={80} required /></label><label>Industry<select value={industry} onChange={(e) => setIndustry(e.target.value)}>{INDUSTRIES.map((option) => <option key={option}>{option}</option>)}</select></label><div className="description-label-row"><label htmlFor="company-description">Description <span className="muted optional">(optional)</span></label><button type="button" className="ai-draft-button" onClick={generateDescription} disabled={aiBusy}><Sparkles size={13} />{aiBusy ? 'Drafting…' : 'Draft with Puter AI'}</button></div><textarea id="company-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will this company work on?" rows={3} maxLength={500} />{aiError && <p className="form-error" role="alert">{aiError}</p>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={16} /> Create company</button></div></form></section></div>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Building2; label: string; value: string; detail: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div><div className="metric-value">{value}</div><p>{detail}</p></div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Building2 size={23} /></div><h3>No companies yet</h3><p>Create a company workspace to organise its future employees, projects and operations.</p><button className="primary-button" onClick={onCreate}><Plus size={16} /> Create your first company</button></div>;
}