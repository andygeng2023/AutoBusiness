import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Check, Download, FileText, Globe, Github, Link2, LockKeyhole, Plus, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, Workflow } from 'lucide-react';
import { supabase } from './lib/supabase';

type Integration = { provider_key: string; enabled_scopes: string[]; status: 'enabled' | 'disabled' };
type Deliverable = { id: string; company_id: string; created_by: string; title: string; kind: string; content: string; status: 'draft' | 'ready' | 'published' | 'archived'; created_at: string; updated_at?: string };
type PublishRequest = { id: string; company_id: string; deliverable_id: string; destination_key: string; destination_url: string; status: 'awaiting_approval' | 'approved' | 'published' | 'rejected' | 'failed'; scheduled_at: string | null; approved_by: string | null; approved_at: string | null; notes: string; created_by: string; created_at: string };
type CatalogItem = { key: string; name: string; category: string; description: string; scope: string; icon: typeof Github; mode: string };
const LOCAL = 'autobusiness-stage5-v1';
const catalog: CatalogItem[] = [
  { key: 'github', name: 'GitHub', category: 'Repository access', description: 'Repository context and future pull-request workflows.', scope: 'Read repository metadata; propose changes for review.', icon: Github, mode: 'Provider adapter required' },
  { key: 'browser', name: 'Browser research', category: 'Browser automation', description: 'Record research tasks and evidence before a human reviews them.', scope: 'Read-only browsing; no purchases, account changes, or submissions.', icon: Globe, mode: 'Browser worker required' },
  { key: 'documents', name: 'Document tools', category: 'Documents', description: 'Create, save, and export Markdown deliverables inside AutoBusiness.', scope: 'Create and download company documents.', icon: FileText, mode: 'Available in this stage' },
  { key: 'publishing', name: 'Website publishing', category: 'Publishing', description: 'Create publishing requests with an approval trail.', scope: 'Draft and approve requests; external publishing adapter required.', icon: Workflow, mode: 'Approval workflow only' },
  { key: 'drive', name: 'Cloud drive', category: 'Documents', description: 'Planned connector for storing deliverables in a connected drive.', scope: 'Read/write only after OAuth and server-side token storage are implemented.', icon: BookOpen, mode: 'Not connected' },
  { key: 'slack', name: 'Team messaging', category: 'Third-party tools', description: 'Planned connector for notifying a team about approved work.', scope: 'Send messages only to explicitly approved destinations.', icon: Link2, mode: 'Not connected' },
];
const makeId = () => crypto.randomUUID();
const localKey = (companyId: string) => LOCAL + ':' + companyId;
function safeJson<T>(value: string | null, fallback: T): T { try { const parsed = value ? JSON.parse(value) : fallback; return parsed as T; } catch { return fallback; } }

export default function StageFive({ companyId, userId, demoMode }: { companyId: string | null; userId: string | null; demoMode: boolean }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [requests, setRequests] = useState<PublishRequest[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('document');
  const [content, setContent] = useState('');
  const [selectedDeliverable, setSelectedDeliverable] = useState('');
  const [destination, setDestination] = useState('website');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    if (!companyId) { setIntegrations([]); setDeliverables([]); setRequests([]); return; }
    if (demoMode) {
      const data = safeJson<{ integrations: Integration[]; deliverables: Deliverable[]; requests: PublishRequest[] }>(localStorage.getItem(localKey(companyId)), { integrations: [], deliverables: [], requests: [] });
      setIntegrations(data.integrations); setDeliverables(data.deliverables); setRequests(data.requests);
      return;
    }
    if (!supabase) return;
    setLoading(true);
    try {
      const [i, d, p] = await Promise.all([
        supabase.from('company_integrations').select('provider_key,enabled_scopes,status').eq('company_id', companyId),
        supabase.from('company_deliverables').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
        supabase.from('publishing_workflows').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
      ]);
      const problem = i.error || d.error || p.error;
      if (problem) throw problem;
      setIntegrations((i.data ?? []) as Integration[]);
      setDeliverables((d.data ?? []) as Deliverable[]);
      setRequests((p.data ?? []) as PublishRequest[]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load integration and deliverable data.'); }
    finally { setLoading(false); }
  }, [companyId, demoMode]);

  useEffect(() => { void load(); }, [load]);

  function persistLocal(nextIntegrations: Integration[], nextDeliverables: Deliverable[], nextRequests: PublishRequest[]) {
    if (companyId) localStorage.setItem(localKey(companyId), JSON.stringify({ integrations: nextIntegrations, deliverables: nextDeliverables, requests: nextRequests }));
    setIntegrations(nextIntegrations); setDeliverables(nextDeliverables); setRequests(nextRequests);
  }
  const isEnabled = (key: string) => integrations.some((item) => item.provider_key === key && item.status === 'enabled');

  async function toggleIntegration(item: CatalogItem) {
    if (!companyId) { setError('Create or select a company first.'); return; }
    setError(''); setNotice('');
    const enabled = !isEnabled(item.key);
    const record: Integration = { provider_key: item.key, enabled_scopes: enabled ? [item.scope] : [], status: enabled ? 'enabled' : 'disabled' };
    const next = [...integrations.filter((i) => i.provider_key !== item.key), record];
    if (demoMode) { persistLocal(next, deliverables, requests); setNotice(enabled ? item.name + ' permission enabled for this demo workspace.' : item.name + ' permission disabled.'); return; }
    if (!supabase || !userId) { setError('Sign in before changing company integration permissions.'); return; }
    setBusy(item.key);
    try {
      const { error: saveError } = await supabase.from('company_integrations').upsert({ company_id: companyId, provider_key: item.key, enabled_scopes: record.enabled_scopes, status: record.status, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'company_id,provider_key' });
      if (saveError) throw saveError;
      await load();
      setNotice(enabled ? item.name + ' permission enabled.' : item.name + ' permission disabled.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update integration permissions.'); }
    finally { setBusy(''); }
  }

  async function saveDeliverable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    if (!companyId) { setError('Create or select a company first.'); return; }
    if (title.trim().length < 2 || content.trim().length < 1) { setError('Add a title and some content.'); return; }
    const now = new Date().toISOString();
    const record: Deliverable = { id: makeId(), company_id: companyId, created_by: userId || 'demo', title: title.trim(), kind, content: content.trim(), status: 'ready', created_at: now, updated_at: now };
    if (demoMode) persistLocal(integrations, [record, ...deliverables], requests);
    else {
      if (!supabase || !userId) { setError('Sign in before saving a deliverable.'); return; }
      const { error: saveError } = await supabase.from('company_deliverables').insert({ company_id: companyId, created_by: userId, title: record.title, kind, content: record.content, status: 'ready' });
      if (saveError) { setError(saveError.message); return; }
      await load();
    }
    setTitle(''); setContent(''); setNotice('Deliverable saved. You can export it as Markdown.');
  }

  function exportDeliverable(item: Deliverable) {
    const blob = new Blob([item.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = item.title.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) + '.md';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  async function requestPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    if (!companyId || !selectedDeliverable) { setError('Select a saved deliverable first.'); return; }
    if (!isEnabled('publishing')) { setError('Enable Website publishing permissions first. This records a request only; it does not publish externally.'); return; }
    const item = deliverables.find((d) => d.id === selectedDeliverable);
    if (!item) { setError('The selected deliverable could not be found.'); return; }
    const record: PublishRequest = { id: makeId(), company_id: companyId, deliverable_id: item.id, destination_key: destination, destination_url: destinationUrl.trim(), status: 'awaiting_approval', scheduled_at: null, approved_by: null, approved_at: null, notes: 'Awaiting an administrator decision. External publishing is not connected in this stage.', created_by: userId || 'demo', created_at: new Date().toISOString() };
    if (demoMode) persistLocal(integrations, deliverables, [record, ...requests]);
    else {
      if (!supabase || !userId) { setError('Sign in before requesting publication.'); return; }
      const { error: saveError } = await supabase.from('publishing_workflows').insert({ company_id: companyId, deliverable_id: item.id, destination_key: destination, destination_url: destinationUrl.trim(), status: 'awaiting_approval', notes: record.notes, created_by: userId });
      if (saveError) { setError(saveError.message); return; }
      await load();
    }
    setNotice('Publishing request created for approval. No external site has been changed.');
    setSelectedDeliverable(''); setDestinationUrl('');
  }

  async function decidePublish(item: PublishRequest, approve: boolean) {
    setError(''); setNotice('');
    if (demoMode) {
      persistLocal(integrations, deliverables, requests.map((r) => r.id === item.id ? { ...r, status: approve ? 'approved' : 'rejected', approved_by: approve ? userId || 'demo' : null, approved_at: approve ? new Date().toISOString() : null, notes: approve ? 'Approved; waiting for a real publishing adapter.' : 'Rejected by reviewer.' } : r));
      setNotice(approve ? 'Request approved. It still needs a publishing adapter to perform the external action.' : 'Publishing request rejected.');
      return;
    }
    if (!supabase || !userId) { setError('Sign in before reviewing publishing requests.'); return; }
    setBusy(item.id);
    try {
      const { error: saveError } = await supabase.from('publishing_workflows').update({ status: approve ? 'approved' : 'rejected', approved_by: approve ? userId : null, approved_at: approve ? new Date().toISOString() : null, notes: approve ? 'Approved; waiting for a real publishing adapter.' : 'Rejected by reviewer.' }).eq('id', item.id).eq('company_id', companyId);
      if (saveError) throw saveError;
      await load();
      setNotice(approve ? 'Request approved. It still needs a publishing adapter to perform the external action.' : 'Publishing request rejected.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the publishing request.'); }
    finally { setBusy(''); }
  }

  return <section className="subpage stage-five">
    <div className="subpage-heading"><div><p className="eyebrow">STAGE 5 · CONTROLLED TOOLS</p><h1>Integrations &amp; deliverables</h1><p className="muted">Grant company-scoped tool permissions, save work products, and route publishing requests through approval.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
    {!companyId && <div className="notice notice-demo">Select or create a company workspace to manage its integrations and deliverables.</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {notice && <div className="notice notice-demo" role="status"><Check size={15} /> {notice}</div>}
    <div className="stage-five-summary"><div className="stage-five-summary-card"><ShieldCheck size={18} /><div><strong>Permission-first</strong><span>External actions are not silently executed.</span></div></div><div className="stage-five-summary-card"><FileText size={18} /><div><strong>{deliverables.length} deliverables</strong><span>Saved by this company workspace.</span></div></div><div className="stage-five-summary-card"><Workflow size={18} /><div><strong>{requests.filter((r) => r.status === 'awaiting_approval').length} awaiting review</strong><span>Publishing requests pending approval.</span></div></div></div>

    <section className="panel stage-five-panel"><div className="panel-header"><div><h2>Integration permissions</h2><p>Enable a permission record for this company. This is not an OAuth connection.</p></div><LockKeyhole size={17} className="muted-icon" /></div><div className="stage-five-integrations">{catalog.map((item) => { const Icon = item.icon; const enabled = isEnabled(item.key); return <article className="stage-five-integration" key={item.key}><div className="stage-five-integration-icon"><Icon size={18} /></div><div className="stage-five-integration-copy"><div className="stage-five-integration-title"><strong>{item.name}</strong><span className={enabled ? 'stage-five-pill enabled' : 'stage-five-pill'}>{enabled ? 'Permission enabled' : 'Disabled'}</span></div><small>{item.category}</small><p>{item.description}</p><span className="stage-five-scope">{item.scope}</span><span className="stage-five-mode">{item.mode}</span></div><button className="secondary-button stage-five-toggle" onClick={() => void toggleIntegration(item)} disabled={!companyId || busy === item.key} aria-label={(enabled ? 'Disable ' : 'Enable ') + item.name}>{enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}{enabled ? 'Disable' : 'Enable'}</button></article>; })}</div></section>

    <section className="panel stage-five-panel"><div className="panel-header"><div><h2>Create a deliverable</h2><p>Save a document, report, research note, or implementation brief and export it as Markdown.</p></div><FileText size={17} className="muted-icon" /></div><form className="stage-five-form" onSubmit={saveDeliverable}><div className="stage-five-form-grid"><label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q4 operating plan" maxLength={160} required /></label><label>Type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="document">Document</option><option value="report">Report</option><option value="research">Research notes</option><option value="implementation">Implementation brief</option><option value="content">Publishing content</option></select></label></div><label>Content<textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write or paste the deliverable content here…" rows={6} maxLength={200000} required /></label><div className="stage-five-form-actions"><small>Content is stored in the selected company workspace. Never paste passwords, API keys, or access tokens.</small><button className="primary-button" disabled={!companyId}><Plus size={15} /> Save deliverable</button></div></form></section>

    <section className="panel stage-five-panel"><div className="panel-header"><div><h2>Saved deliverables</h2><p>Export a copy or route it for publication review.</p></div><FileText size={17} className="muted-icon" /></div>{deliverables.length === 0 ? <div className="stage-five-empty">No deliverables yet. Save a document above to start an artifact history.</div> : <div className="stage-five-deliverables">{deliverables.map((item) => <article className="stage-five-deliverable" key={item.id}><div className="stage-five-deliverable-main"><strong>{item.title}</strong><span>{item.kind} · {new Date(item.created_at).toLocaleDateString()}</span><p>{item.content.slice(0, 180)}{item.content.length > 180 ? '…' : ''}</p></div><div className="stage-five-deliverable-actions"><button className="secondary-button" onClick={() => exportDeliverable(item)}><Download size={14} /> Export .md</button><button className="secondary-button" onClick={() => { setSelectedDeliverable(item.id); document.getElementById('stage-five-publish')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Request publish</button></div></article>)}</div>}</section>

    <section className="panel stage-five-panel" id="stage-five-publish"><div className="panel-header"><div><h2>Publishing workflow</h2><p>Requests are stored for review. Approved requests still require a real provider adapter to publish externally.</p></div><Workflow size={17} className="muted-icon" /></div><form className="stage-five-form" onSubmit={requestPublish}><div className="stage-five-form-grid"><label>Deliverable<select value={selectedDeliverable} onChange={(e) => setSelectedDeliverable(e.target.value)} required><option value="">Choose a saved deliverable…</option>{deliverables.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label><label>Destination<select value={destination} onChange={(e) => setDestination(e.target.value)}><option value="website">Website / CMS</option><option value="github-pages">GitHub Pages</option><option value="github-release">GitHub release</option><option value="other">Other</option></select></label></div><label>Destination URL (optional)<input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} type="url" placeholder="https://example.com/draft" /></label><div className="stage-five-form-actions"><small>Requires Website publishing permission and creates an approval request only.</small><button className="primary-button" disabled={!companyId || !deliverables.length}><Plus size={15} /> Request approval</button></div></form>{requests.length === 0 ? <div className="stage-five-empty">No publishing requests yet.</div> : <div className="stage-five-publish-list">{requests.map((item) => { const d = deliverables.find((x) => x.id === item.deliverable_id); return <article className="stage-five-publish-item" key={item.id}><div><strong>{d?.title ?? 'Deliverable'}</strong><span>{item.destination_key}{item.destination_url ? ' · ' + item.destination_url : ''}</span><p>{item.notes}</p></div><div className="stage-five-publish-actions"><span className={'stage-five-pill ' + item.status}>{item.status.replace('_', ' ')}</span>{item.status === 'awaiting_approval' && <><button className="secondary-button" onClick={() => void decidePublish(item, true)} disabled={busy === item.id}>Approve</button><button className="secondary-button" onClick={() => void decidePublish(item, false)} disabled={busy === item.id}>Reject</button></>}</div></article>; })}</div>}</section>
    <p className="stage-five-disclaimer">Security boundary: provider OAuth, secret storage, real browser automation, repository writes, and external publishing are intentionally not simulated. This stage stores permissions and approval records; live actions require server-side adapters and credentials.</p>
  </section>;
}
