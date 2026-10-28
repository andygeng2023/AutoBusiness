import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, BriefcaseBusiness, Check, CircleAlert, ClipboardList, Plus, RefreshCw, Users, X } from 'lucide-react';
import { supabase } from './lib/supabase';

type Section = 'Employees' | 'Departments' | 'Projects' | 'Operations';
type Department = { id: string; name: string; description: string };
type Employee = { id: string; full_name: string; email: string | null; role_title: string; employment_type: 'human' | 'ai'; status: 'active' | 'inactive' | 'planned'; department_id: string | null };
type Project = { id: string; name: string; description: string; status: 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled'; priority: 'low' | 'medium' | 'high' | 'urgent'; department_id: string | null; start_date: string | null; due_date: string | null };
type Task = { id: string; title: string; description: string; status: 'todo' | 'in_progress' | 'blocked' | 'done'; priority: 'low' | 'medium' | 'high' | 'urgent'; project_id: string | null; department_id: string | null; assigned_employee_id: string | null; due_date: string | null };
type Store = { departments: Department[]; employees: Employee[]; projects: Project[]; tasks: Task[] };
const STORAGE_KEY = 'autobusiness-stage2-data-v1';
const emptyStore = (): Store => ({ departments: [], employees: [], projects: [], tasks: [] });
const localRead = (): Store => { try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return { departments: Array.isArray(v.departments) ? v.departments : [], employees: Array.isArray(v.employees) ? v.employees : [], projects: Array.isArray(v.projects) ? v.projects : [], tasks: Array.isArray(v.tasks) ? v.tasks : [] }; } catch { return emptyStore(); } };
const uid = () => crypto.randomUUID();
const titles: Record<Section, { eyebrow: string; description: string }> = {
  Employees: { eyebrow: 'PEOPLE DIRECTORY', description: 'Manage human team members and planned AI employee profiles.' },
  Departments: { eyebrow: 'ORGANISATION', description: 'Group people and work into clear company departments.' },
  Projects: { eyebrow: 'DELIVERY', description: 'Track project ownership, priority, status and target dates.' },
  Operations: { eyebrow: 'WORK QUEUE', description: 'Create and assign tasks, then move them through the delivery workflow.' },
};
export default function StageTwo({ page, companyId, userId, demoMode }: { page: Section; companyId: string | null; userId: string | null; demoMode: boolean }) {
  const [store, setStore] = useState<Store>(() => localRead());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const title = titles[page];

  const load = useCallback(async () => {
    if (demoMode) { setStore(localRead()); return; }
    if (!supabase || !companyId) { setStore(emptyStore()); return; }
    setLoading(true); setError('');
    try {
      const [d, e, p, t] = await Promise.all([
        supabase.from('departments').select('id,name,description').eq('company_id', companyId).order('name'),
        supabase.from('employees').select('id,full_name,email,role_title,employment_type,status,department_id').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('projects').select('id,name,description,status,priority,department_id,start_date,due_date').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('tasks').select('id,title,description,status,priority,project_id,department_id,assigned_employee_id,due_date').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);
      const firstError = d.error || e.error || p.error || t.error;
      if (firstError) throw firstError;
      setStore({ departments: d.data ?? [], employees: e.data ?? [], projects: p.data ?? [], tasks: t.data ?? [] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load Stage 2 data.'); }
    finally { setLoading(false); }
  }, [companyId, demoMode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (demoMode) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* storage may be unavailable */ } } }, [demoMode, store]);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!draft.name?.trim() && !draft.full_name?.trim() && !draft.title?.trim()) { setError('Enter a name or title first.'); return; }
    const common = { company_id: companyId, created_by: userId };
    let table = '';
    let payload: Record<string, unknown> = {};
    if (page === 'Departments') { table = 'departments'; payload = { ...common, name: draft.name.trim(), description: draft.description?.trim() ?? '' }; }
    if (page === 'Employees') { table = 'employees'; payload = { ...common, full_name: draft.full_name.trim(), email: draft.email?.trim() || null, role_title: draft.role_title?.trim() || 'Team member', employment_type: draft.employment_type || 'human', status: draft.status || 'active', department_id: draft.department_id || null }; }
    if (page === 'Projects') { table = 'projects'; payload = { ...common, name: draft.name.trim(), description: draft.description?.trim() ?? '', status: draft.status || 'planned', priority: draft.priority || 'medium', department_id: draft.department_id || null, start_date: draft.start_date || null, due_date: draft.due_date || null }; }
    if (page === 'Operations') { table = 'tasks'; payload = { ...common, title: draft.title.trim(), description: draft.description?.trim() ?? '', status: draft.status || 'todo', priority: draft.priority || 'medium', project_id: draft.project_id || null, department_id: draft.department_id || null, assigned_employee_id: draft.assigned_employee_id || null, due_date: draft.due_date || null }; }
    if (demoMode) {
      const id = uid();
      const row = { id, ...payload } as unknown as Department | Employee | Project | Task;
      setStore(current => ({ ...current, [table]: [row, ...current[table as keyof Store]] }));
    } else {
      if (!supabase || !companyId || !userId) { setError('Choose a company and sign in before creating records.'); return; }
      const { error: insertError } = await supabase.from(table).insert(payload);
      if (insertError) { setError(insertError.message); return; }
      await load();
    }
    setDraft({}); setAdding(false); setNotice('Saved successfully.');
  };

  const updateStatus = async (kind: 'projects' | 'tasks' | 'employees', id: string, status: string) => {
    setError(''); setNotice('');
    const table = kind;
    if (demoMode) {
      setStore(current => ({ ...current, [table]: current[table].map(row => row.id === id ? { ...row, status } as never : row) }));
    } else {
      if (!supabase) return;
      const { error: updateError } = await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', companyId);
      if (updateError) { setError(updateError.message); return; }
      await load();
    }
    setNotice('Status updated.');
  };

  const remove = async (kind: keyof Store, id: string) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    setError(''); setNotice('');
    if (demoMode) setStore(current => ({ ...current, [kind]: current[kind].filter(row => row.id !== id) as never }));
    else {
      if (!supabase) return;
      const { error: deleteError } = await supabase.from(kind).delete().eq('id', id).eq('company_id', companyId);
      if (deleteError) { setError(deleteError.message); return; }
      await load();
    }
    setNotice('Record deleted.');
  };

  const filtered = useMemo(() => {
    const rows = store[page === 'Employees' ? 'employees' : page === 'Departments' ? 'departments' : page === 'Projects' ? 'projects' : 'tasks'] as Array<Record<string, unknown>>;
    const q = query.trim().toLowerCase();
    return rows.filter(row => !q || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(q)));
  }, [page, query, store]);
  const counts = store.tasks.reduce((acc, task) => { acc[task.status] = (acc[task.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return <section className="subpage stage-two">
    <div className="subpage-heading"><div><p className="eyebrow">{title.eyebrow}</p><h1>{page === 'Operations' ? 'Tasks & operations' : page}</h1><p className="muted">{title.description}</p></div><div className="stage-actions"><button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button><button className="primary-button" onClick={() => { setDraft({}); setError(''); setAdding(true); }} disabled={!companyId}><Plus size={16} /> Add {page === 'Operations' ? 'task' : page === 'Employees' ? 'employee' : page === 'Projects' ? 'project' : 'department'}</button></div></div>
    {!companyId && <div className="notice notice-demo"><CircleAlert size={16} />Create or select a company first. Stage 2 records belong to a company.</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}{notice && <div className="notice notice-success" role="status"><Check size={15} />{notice}</div>}
    {page === 'Operations' && <div className="stage-metrics"><div className="metric-card"><span>To do</span><strong>{counts.todo ?? 0}</strong></div><div className="metric-card"><span>In progress</span><strong>{counts.in_progress ?? 0}</strong></div><div className="metric-card"><span>Blocked</span><strong>{counts.blocked ?? 0}</strong></div><div className="metric-card"><span>Completed</span><strong>{counts.done ?? 0}</strong></div></div>}
    <div className="search-box"><span aria-hidden="true">⌕</span><input aria-label={'Search ' + page} placeholder={'Search ' + page.toLowerCase() + '…'} value={query} onChange={e => setQuery(e.target.value)} /></div>
    {loading ? <div className="panel roadmap-card">Loading records…</div> : filtered.length === 0 ? <div className="panel roadmap-card"><div className="roadmap-icon">{page === 'Employees' ? <Users size={24}/> : page === 'Projects' ? <BriefcaseBusiness size={24}/> : page === 'Operations' ? <ClipboardList size={24}/> : <Activity size={24}/>}</div><h2>No {page === 'Operations' ? 'tasks' : page.toLowerCase()} yet</h2><p>{demoMode ? 'Add a record to try the workflow. Demo data is stored in this browser only.' : 'Add the first record for this company. Records are shared with authorised company members.'}</p><button className="primary-button" onClick={() => setAdding(true)} disabled={!companyId}><Plus size={15}/> Add first record</button></div> : <div className="panel stage-table-wrap"><table className="stage-table"><thead><tr>{(page === 'Departments' ? ['Department', 'Description', ''] : page === 'Employees' ? ['Employee', 'Department', 'Type', 'Status', ''] : page === 'Projects' ? ['Project', 'Priority', 'Status', 'Due date', ''] : ['Task', 'Project / assignee', 'Priority', 'Status', 'Due date', '']).map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{filtered.map((item) => {
      const row = item as Record<string, unknown>;
      const id = String(row.id);
      const status = String(row.status ?? '');
      const dept = store.departments.find(d => d.id === row.department_id)?.name ?? '—';
      const project = store.projects.find(p => p.id === row.project_id)?.name ?? 'Unassigned';
      const employee = store.employees.find(e => e.id === row.assigned_employee_id)?.full_name ?? '';
      return <tr key={id}><td><strong>{String(row.full_name ?? row.name ?? row.title ?? '')}</strong><small>{String(row.role_title ?? row.description ?? row.email ?? '')}</small></td>
        {page === 'Departments' && <><td>{String(row.description || '—')}</td><td><button className="icon-button danger-button" aria-label="Delete department" onClick={() => void remove('departments',id)}><X size={15}/></button></td></>}
        {page === 'Employees' && <><td>{dept}</td><td><span className="status-badge">{row.employment_type === 'ai' ? 'AI employee' : 'Human'}</span></td><td><select aria-label="Employee status" value={status} onChange={e => void updateStatus('employees',id,e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="planned">Planned</option></select></td><td><button className="icon-button danger-button" aria-label="Delete employee" onClick={() => void remove('employees',id)}><X size={15}/></button></td></>}
        {page === 'Projects' && <><td>{String(row.priority)}</td><td><select aria-label="Project status" value={status} onChange={e => void updateStatus('projects',id,e.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td><td>{String(row.due_date || '—')}</td><td><button className="icon-button danger-button" aria-label="Delete project" onClick={() => void remove('projects',id)}><X size={15}/></button></td></>}
        {page === 'Operations' && <><td>{project}{employee && <small>{employee}</small>}</td><td>{String(row.priority)}</td><td><select aria-label="Task status" value={status} onChange={e => void updateStatus('tasks',id,e.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></td><td>{String(row.due_date || '—')}</td><td><button className="icon-button danger-button" aria-label="Delete task" onClick={() => void remove('tasks',id)}><X size={15}/></button></td></>}
      </tr>;
    })}</tbody></table></div>}
    {adding && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAdding(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="stage-two-title"><div className="modal-header"><div><p className="eyebrow">STAGE 2</p><h2 id="stage-two-title">Add {page === 'Operations' ? 'task' : page === 'Employees' ? 'employee' : page === 'Projects' ? 'project' : 'department'}</h2><p className="muted">Record is scoped to the selected company.</p></div><button className="icon-button" aria-label="Close" onClick={() => setAdding(false)}><X size={17}/></button></div><form className="stack-form" onSubmit={add}>
      {page === 'Departments' && <><label>Department name<input required minLength={2} maxLength={100} value={draft.name ?? ''} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Marketing"/></label><label>Description<textarea rows={3} maxLength={1000} value={draft.description ?? ''} onChange={e=>setDraft({...draft,description:e.target.value})}/></label></>}
      {page === 'Employees' && <><label>Full name<input required minLength={2} maxLength={120} value={draft.full_name ?? ''} onChange={e=>setDraft({...draft,full_name:e.target.value})} placeholder="e.g. Alex Morgan"/></label><label>Email (optional)<input type="email" value={draft.email ?? ''} onChange={e=>setDraft({...draft,email:e.target.value})}/></label><label>Role title<input maxLength={120} value={draft.role_title ?? ''} onChange={e=>setDraft({...draft,role_title:e.target.value})} placeholder="e.g. Operations manager"/></label><label>Employee type<select value={draft.employment_type ?? 'human'} onChange={e=>setDraft({...draft,employment_type:e.target.value})}><option value="human">Human</option><option value="ai">AI employee (profile only)</option></select></label><label>Department<select value={draft.department_id ?? ''} onChange={e=>setDraft({...draft,department_id:e.target.value})}><option value="">No department</option>{store.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></>}
      {page === 'Projects' && <><label>Project name<input required minLength={2} maxLength={160} value={draft.name ?? ''} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Website relaunch"/></label><label>Description<textarea rows={3} maxLength={3000} value={draft.description ?? ''} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><label>Department<select value={draft.department_id ?? ''} onChange={e=>setDraft({...draft,department_id:e.target.value})}><option value="">No department</option>{store.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Priority<select value={draft.priority ?? 'medium'} onChange={e=>setDraft({...draft,priority:e.target.value})}>{['low','medium','high','urgent'].map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Status<select value={draft.status ?? 'planned'} onChange={e=>setDraft({...draft,status:e.target.value})}>{['planned','active','on_hold','completed','cancelled'].map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}</select></label><label>Start date<input type="date" value={draft.start_date ?? ''} onChange={e=>setDraft({...draft,start_date:e.target.value})}/></label><label>Due date<input type="date" min={draft.start_date || undefined} value={draft.due_date ?? ''} onChange={e=>setDraft({...draft,due_date:e.target.value})}/></label></>}
      {page === 'Operations' && <><label>Task title<input required minLength={2} maxLength={200} value={draft.title ?? ''} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="e.g. Draft launch plan"/></label><label>Description<textarea rows={3} maxLength={5000} value={draft.description ?? ''} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><label>Project<select value={draft.project_id ?? ''} onChange={e=>setDraft({...draft,project_id:e.target.value})}><option value="">No project</option>{store.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Department<select value={draft.department_id ?? ''} onChange={e=>setDraft({...draft,department_id:e.target.value})}><option value="">No department</option>{store.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Assign to employee<select value={draft.assigned_employee_id ?? ''} onChange={e=>setDraft({...draft,assigned_employee_id:e.target.value})}><option value="">Unassigned</option>{store.employees.filter(e=>e.status==='active').map(e=><option key={e.id} value={e.id}>{e.full_name} ({e.employment_type})</option>)}</select></label><label>Priority<select value={draft.priority ?? 'medium'} onChange={e=>setDraft({...draft,priority:e.target.value})}>{['low','medium','high','urgent'].map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Due date<input type="date" value={draft.due_date ?? ''} onChange={e=>setDraft({...draft,due_date:e.target.value})}/></label></>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setAdding(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={15}/> Save record</button></div></form></section></div>}
  </section>;
}
