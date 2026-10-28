import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bot, CheckCircle2, CircleAlert, LoaderCircle, Play, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from './lib/supabase';
import { puterChat } from './lib/puter';

type Employee = { id: string; full_name: string; role_title: string; employment_type: 'human' | 'ai'; status: 'active' | 'inactive' | 'planned'; department_id: string | null };
type Run = { id: string; employee_id: string; goal: string; status: 'planned' | 'approved' | 'completed' | 'failed' | 'cancelled'; plan: unknown; result_summary: string; created_at: string };
type Department = { id: string; name: string };
const RUN_MODEL = 'gpt-5.4-nano';

function extractText(response: unknown): string {
  if (typeof response === 'string') return response.trim();
  if (response && typeof response === 'object') {
    const item = response as { message?: { content?: unknown }; content?: unknown; text?: unknown };
    const content = item.message?.content ?? item.content ?? item.text;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) return content.map(part => part && typeof part === 'object' && 'text' in part ? String((part as {text: unknown}).text) : '').join('\n').trim();
  }
  return '';
}
function safeJson(text: string): unknown {
  const cleaned = text.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return { plan_text: text }; }
}

export default function StageThree({ companyId, userId, demoMode }: { companyId: string | null; userId: string | null; demoMode: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastResult, setLastResult] = useState<{employee:string;goal:string;plan:string}|null>(null);

  const load = useCallback(async () => {
    setError('');
    if (demoMode) {
      try {
        const raw = JSON.parse(localStorage.getItem('autobusiness-stage2-data-v1') || '{}');
        const staff = Array.isArray(raw.employees) ? raw.employees as Employee[] : [];
        const depts = Array.isArray(raw.departments) ? raw.departments as Department[] : [];
        setEmployees(staff); setDepartments(depts);
        const localRuns = JSON.parse(localStorage.getItem('autobusiness-stage3-runs-v1') || '[]');
        setRuns(Array.isArray(localRuns) ? localRuns : []);
      } catch { setEmployees([]); setDepartments([]); setRuns([]); }
      return;
    }
    if (!supabase || !companyId) { setEmployees([]); setDepartments([]); setRuns([]); return; }
    setLoading(true);
    try {
      const [e,d,r] = await Promise.all([
        supabase.from('employees').select('id,full_name,role_title,employment_type,status,department_id').eq('company_id',companyId).order('created_at',{ascending:false}),
        supabase.from('departments').select('id,name').eq('company_id',companyId).order('name'),
        supabase.from('ai_employee_runs').select('id,employee_id,goal,status,plan,result_summary,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(30),
      ]);
      const problem = e.error || d.error || r.error;
      if (problem) throw problem;
      setEmployees(e.data ?? []); setDepartments(d.data ?? []); setRuns((r.data ?? []) as Run[]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load AI employee workspace.'); }
    finally { setLoading(false); }
  }, [companyId,demoMode]);

  useEffect(()=>{void load();},[load]);

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setLastResult(null);
    const employee = employees.find(e=>e.id===employeeId);
    if (!companyId || !employee || employee.employment_type !== 'ai' || employee.status !== 'active') { setError('Select an active AI employee profile. Create one in Employees first.'); return; }
    if (goal.trim().length < 5) { setError('Describe a goal in at least five characters.'); return; }
    if (!demoMode && (!supabase || !userId)) { setError('Sign in before running an AI employee.'); return; }

    setRunning(true);
    let runId: string | null = null;
    try {
      const createdAt = new Date().toISOString();
      const localId = crypto.randomUUID();
      if (demoMode) {
        const next: Run = { id: localId, employee_id: employee.id, goal: goal.trim(), status: 'planned', plan: {}, result_summary: '', created_at: createdAt };
        const previous = JSON.parse(localStorage.getItem('autobusiness-stage3-runs-v1') || '[]');
        localStorage.setItem('autobusiness-stage3-runs-v1', JSON.stringify([next, ...(Array.isArray(previous) ? previous : [])].slice(0,30)));
        runId = localId;
      } else {
        const { data, error: insertError } = await supabase!.from('ai_employee_runs').insert({ company_id: companyId, employee_id: employee.id, requested_by: userId, goal: goal.trim(), status: 'planned' }).select('id').single();
        if (insertError) throw insertError;
        runId = data.id;
      }
      // Explicit user-triggered run only. No background loops, tools, or external side effects.
      const prompt = [
        'You are an AI employee working in a company productivity application.',
        'Produce a useful, concrete plan for the goal below. Do not claim to have performed external actions.',
        'Return valid JSON only with keys: summary (string), steps (array of objects with title, description, deliverable), risks (array of strings), questions (array of strings), next_action (string).',
        'Keep the plan practical, bounded, and transparent about missing information.',
        'Employee name: ' + employee.full_name,
        'Role: ' + employee.role_title,
        'Department: ' + (departments.find(d=>d.id===employee.department_id)?.name ?? 'Unassigned'),
        'Company ID: ' + companyId,
        'User goal: ' + goal.trim(),
      ].join('\n\n');
      const planText = extractText(await puterChat(prompt,{model:RUN_MODEL}));
      if (!planText) throw new Error('Puter returned an empty response. Please try again.');
      const plan = safeJson(planText);
      const summary = typeof plan === 'object' && plan && 'summary' in plan && typeof (plan as {summary:unknown}).summary === 'string' ? (plan as {summary:string}).summary : planText.slice(0,1000);
      if (demoMode) {
        const previous = JSON.parse(localStorage.getItem('autobusiness-stage3-runs-v1') || '[]') as Run[];
        const next = previous.map(run => run.id === runId ? {...run,status:'completed' as const,plan,result_summary:summary} : run);
        localStorage.setItem('autobusiness-stage3-runs-v1',JSON.stringify(next));
      } else {
        const { error: updateError } = await supabase!.from('ai_employee_runs').update({status:'completed',plan,result_summary:summary,updated_at:new Date().toISOString()}).eq('id',runId!).eq('company_id',companyId);
        if (updateError) throw updateError;
      }
      setLastResult({employee:employee.full_name,goal:goal.trim(),plan:JSON.stringify(plan,null,2)});
      setNotice('AI plan generated and saved to run history.');
      setGoal('');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The AI run failed.';
      setError(message);
      if (runId) {
        if (demoMode) {
          try {
            const previous = JSON.parse(localStorage.getItem('autobusiness-stage3-runs-v1') || '[]') as Run[];
            localStorage.setItem('autobusiness-stage3-runs-v1',JSON.stringify(previous.map(run=>run.id===runId?{...run,status:'failed' as const,result_summary:message}:run)));
          } catch { /* local history unavailable */ }
        } else if (supabase && companyId) {
          await supabase.from('ai_employee_runs').update({status:'failed',result_summary:message.slice(0,5000),updated_at:new Date().toISOString()}).eq('id',runId).eq('company_id',companyId);
        }
        await load();
      }
    } finally { setRunning(false); }
  }

  const statusLabel = (status: Run['status']) => ({planned:'Planned',approved:'Approved',completed:'Completed',failed:'Failed',cancelled:'Cancelled'}[status]);
  const planSummary = (run: Run) => run.result_summary || (typeof run.plan === 'object' && run.plan && 'summary' in run.plan ? String((run.plan as {summary:unknown}).summary) : '');

  return <section className="subpage stage-three">
    <div className="subpage-heading"><div><p className="eyebrow">STAGE 3 · AI WORKFORCE</p><h1>AI employee studio</h1><p className="muted">Run a bounded AI planning session, inspect its result and keep a company-scoped history.</p></div><button className="secondary-button" onClick={()=>void load()} disabled={loading||running}><RefreshCw size={15}/> Refresh</button></div>
    {!companyId && <div className="notice notice-demo"><CircleAlert size={16}/>Create or select a company before running AI employees.</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {notice && <div className="notice notice-success" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    {demoMode && <div className="notice notice-demo"><Sparkles size={16}/>Demo mode stores run history in this browser. Puter may ask you to sign in or authorize an AI request.</div>}
    <div className="panel ai-studio-panel">
      <div className="ai-studio-icon"><Bot size={23}/></div><div className="ai-studio-copy"><h2>Start an AI employee run</h2><p>Choose an active AI employee and describe one goal. The employee will draft a plan; it will not execute tools or change external systems.</p></div>
      <form className="stack-form" onSubmit={execute}>
        <label>AI employee<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Choose an AI employee</option>{employees.filter(e=>e.employment_type==='ai'&&e.status==='active').map(e=><option key={e.id} value={e.id}>{e.full_name} — {e.role_title}</option>)}</select></label>
        {employees.filter(e=>e.employment_type==='ai'&&e.status==='active').length===0 && <p className="muted tiny">No active AI employee profiles found. Open Employees, add a profile, and set its type to AI employee and status to Active.</p>}
        <label>Goal<textarea required minLength={5} maxLength={3000} rows={4} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Example: Draft a 30-day customer research plan for our new product."/></label>
        <button className="primary-button full-button" type="submit" disabled={running||!companyId||!employeeId||goal.trim().length<5}>{running?<><LoaderCircle size={16} className="spin-icon"/>Generating plan…</>:<><Play size={16}/>Run AI planning session</>}</button>
      </form>
    </div>
    {lastResult && <div className="panel ai-result-panel"><div className="panel-header"><div><p className="eyebrow">LATEST RESULT</p><h2>{lastResult.employee}</h2><p className="muted">Goal: {lastResult.goal}</p></div><CheckCircle2 size={20}/></div><pre className="ai-result-json">{lastResult.plan}</pre></div>}
    <div className="panel ai-history-panel"><div className="panel-header"><div><h2>Recent runs</h2><p>Last 30 planning attempts for this company.</p></div><span className="status-badge">{runs.length} runs</span></div>
      {loading?<p className="muted">Loading history…</p>:runs.length===0?<p className="muted">No runs yet. Start a planning session to create the first record.</p>:<div className="ai-run-list">{runs.map(run=><article className="ai-run-row" key={run.id}><div className="ai-run-symbol"><Bot size={17}/></div><div className="ai-run-copy"><strong>{employees.find(e=>e.id===run.employee_id)?.full_name??'AI employee'}</strong><p>{run.goal}</p>{planSummary(run)&&<small>{planSummary(run).slice(0,220)}</small>}<time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time></div><span className={'ai-run-status ai-run-'+run.status}>{statusLabel(run.status)}</span></article>)}</div>}
    </div>
    <p className="muted tiny">Stage 3 is user-triggered planning only. Durable background execution, tool permissions, approvals and autonomous actions are reserved for a later stage.</p>
  </section>;
}
