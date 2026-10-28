import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, Bot, Building2, Check,
  CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Command, Gauge,
  Inbox, LayoutDashboard, LockKeyhole, MessageCircle, MoreHorizontal, Plus,
  Search, Send, Settings2, ShieldCheck, Sparkles, Users, Workflow, Zap
} from "lucide-react";
import "./styles.css";

type Employee = { id: string; name: string; role: string; deptId: string; tone: string; model: string; instructions: string; status: "Available" | "Working" | "Needs review"; task?: string };
type Dept = { id: string; name: string; parentId?: string };
type Job = { id: string; title: string; employeeId: string; status: "Queued" | "In progress" | "Submitted" | "Approved"; priority: "Normal" | "Urgent"; created: string; result?: string; submittedAt?: string };
type Message = { id: string; from: string; text: string; time: string; jobId?: string };
type Conversation = { id: string; name: string; kind: "private" | "group"; members: string[]; messages: Message[] };
type Company = { id: string; name: string; industry: string; initials: string; color: string; description: string };
type Settings = { approvalRequired: boolean; dailyLimit: number; monthlyLimit: number; autoRun: boolean; connectors: string[] };

const initialCompanies: Company[] = [
  { id: "northstar", name: "Northstar Studio", industry: "Creative & marketing", initials: "NS", color: "violet", description: "Brand, content and client delivery" },
  { id: "fieldnote", name: "Fieldnote Labs", industry: "Software & product", initials: "FL", color: "blue", description: "Product development and research" },
  { id: "goodfolk", name: "Goodfolk Goods", industry: "Retail & commerce", initials: "GG", color: "amber", description: "Operations, growth and support" }
];
const seedDepts: Dept[] = [
  { id: "leadership", name: "Leadership" }, { id: "creative", name: "Creative" },
  { id: "growth", name: "Growth" }, { id: "operations", name: "Operations" },
  { id: "content", name: "Content", parentId: "creative" }, { id: "design", name: "Design", parentId: "creative" }
];
const seedEmployees: Employee[] = [
  { id: "maya", name: "Maya Chen", role: "Chief of Staff", deptId: "leadership", tone: "Clear & concise", model: "GPT-4o mini", instructions: "Prioritise the highest-impact work. Ask before making external commitments.", status: "Available" },
  { id: "leo", name: "Leo Martin", role: "Brand Strategist", deptId: "creative", tone: "Thoughtful & creative", model: "GPT-4o", instructions: "Ground recommendations in audience insight and brand strategy.", status: "Working", task: "Q4 campaign positioning" },
  { id: "amara", name: "Amara Okafor", role: "Content Lead", deptId: "content", tone: "Warm & articulate", model: "Claude Sonnet", instructions: "Write clearly, avoid clichés, and verify claims.", status: "Available" },
  { id: "noah", name: "Noah Williams", role: "Growth Analyst", deptId: "growth", tone: "Analytical", model: "GPT-4o mini", instructions: "Show assumptions and use measurable outcomes.", status: "Needs review", task: "Weekly growth report" },
  { id: "ella", name: "Ella Rossi", role: "Operations Manager", deptId: "operations", tone: "Practical & direct", model: "GPT-4o mini", instructions: "Prefer repeatable processes and concise checklists.", status: "Available" },
  { id: "jules", name: "Jules Park", role: "Product Designer", deptId: "design", tone: "Curious & collaborative", model: "Claude Sonnet", instructions: "Explain trade-offs and design for accessibility.", status: "Available" }
];
const seedJobs: Job[] = [
  { id: "job-1", title: "Q4 campaign positioning", employeeId: "leo", status: "In progress", priority: "Urgent", created: "10 min ago" },
  { id: "job-2", title: "Weekly growth report", employeeId: "noah", status: "Submitted", priority: "Normal", created: "28 min ago", submittedAt: "09:26", result: "Weekly Growth Report\n\nExecutive summary\nThis is illustrative sample content, not live analytics from a connected data source.\n\nKey findings\n• Compare sessions, sign-ups, and conversion rate by acquisition channel.\n• Identify channels with rising acquisition cost or declining conversion.\n• Validate anomalies before acting.\n\nRecommended next steps\n1. Review channel-level conversion and cost trends.\n2. Investigate the largest week-over-week changes.\n3. Run one measurable experiment on the strongest opportunity." },
  { id: "job-3", title: "Review onboarding flow", employeeId: "jules", status: "Queued", priority: "Normal", created: "1 hr ago" }
];
const seedConversations: Conversation[] = [
  { id: "team", name: "Company team", kind: "group", members: ["maya", "leo", "amara", "noah", "ella", "jules"], messages: [
    { id: "m1", from: "maya", text: "Morning team. Please share blockers before the planning review.", time: "09:12" },
    { id: "m2", from: "leo", text: "Campaign positioning is in progress. I’ll share two directions shortly.", time: "09:18" },
    { id: "m3", from: "noah", text: "The weekly growth report is ready for review.", time: "09:26", jobId: "job-2" }
  ] },
  { id: "maya-chat", name: "Maya Chen", kind: "private", members: ["maya"], messages: [{ id: "m4", from: "maya", text: "I can help coordinate priorities, delegate work and surface decisions that need you.", time: "09:08" }] },
  { id: "leo-chat", name: "Leo Martin", kind: "private", members: ["leo"], messages: [{ id: "m5", from: "leo", text: "I’m exploring a sharper campaign story with a clear customer promise.", time: "09:18" }] }
];
const defaultSettings: Settings = { approvalRequired: true, dailyLimit: 50, monthlyLimit: 900, autoRun: false, connectors: ["Puter AI", "Supabase", "GitHub"] };
const readStore = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem("autobusiness:" + key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const persist = (key: string, value: unknown) => { try { localStorage.setItem("autobusiness:" + key, JSON.stringify(value)); } catch { /* storage can be unavailable */ } };
const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
declare global { interface Window { puter?: { ai?: { chat: (prompt: string, options?: Record<string, unknown>) => Promise<unknown> } } } }

export default function App() {
  const [companies, setCompanies] = useState(() => readStore("companies", initialCompanies));
  const [company, setCompany] = useState<Company | null>(null);
  const [depts, setDepts] = useState(() => readStore("depts", seedDepts));
  const [employees, setEmployees] = useState(() => readStore("employees", seedEmployees));
  const [jobs, setJobs] = useState(() => readStore("jobs", seedJobs));
  const [conversations, setConversations] = useState(() => readStore("conversations", seedConversations));
  const [settings, setSettings] = useState(() => readStore("settings", defaultSettings));
  const [page, setPage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState("maya");
  const [selectedChat, setSelectedChat] = useState("team");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobEmployee, setJobEmployee] = useState("maya");
  const [showJobForm, setShowJobForm] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showChatForm, setShowChatForm] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [newEmployeeDept, setNewEmployeeDept] = useState("leadership");
  const [newChatName, setNewChatName] = useState("");
  const [newChatMembers, setNewChatMembers] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);\n  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeSettings, setActiveSettings] = useState("General");

  useEffect(() => { persist("companies", companies); }, [companies]);
  useEffect(() => { if (company) persist("depts:" + company.id, depts); }, [company, depts]);
  useEffect(() => { if (company) persist("employees:" + company.id, employees); }, [company, employees]);
  useEffect(() => { if (company) persist("jobs:" + company.id, jobs); }, [company, jobs]);
  useEffect(() => { if (company) persist("conversations:" + company.id, conversations); }, [company, conversations]);
  useEffect(() => { if (company) persist("settings:" + company.id, settings); }, [company, settings]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); } }, [toast]);

  const activeEmployee = employees.find((e) => e.id === selectedEmployee) ?? employees[0];
  const activeConversation = conversations.find((c) => c.id === selectedChat) ?? conversations[0];
  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const pendingJobs = jobs.filter((j) => j.status === "Queued" || j.status === "Submitted");
  const nav = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Employees", icon: Users },
    { label: "Communication", icon: MessageCircle, count: conversations.length },
    { label: "Jobs & approvals", icon: Inbox, count: pendingJobs.length },
    { label: "Settings", icon: Settings2 }
  ];

  const notify = (text: string) => setToast(text);
  const openCompany = (item: Company) => {
    setCompany(item);
    setDepts(readStore("depts:" + item.id, seedDepts));
    setEmployees(readStore("employees:" + item.id, seedEmployees));
    setJobs(readStore("jobs:" + item.id, seedJobs));
    setConversations(readStore("conversations:" + item.id, seedConversations));
    setSettings(readStore("settings:" + item.id, defaultSettings));
    setSelectedEmployee("maya");
    setSelectedChat("team");
    setPage("Dashboard");
  };
  const changePage = (next: string) => { setPage(next); if (next === "Communication") setSelectedChat("team"); };
  const createJob = (event: FormEvent) => {
    event.preventDefault();
    if (!jobTitle.trim()) return;
    const job: Job = { id: "job-" + crypto.randomUUID(), title: jobTitle.trim(), employeeId: jobEmployee, status: settings.approvalRequired ? "Queued" : "In progress", priority: "Normal", created: "Just now" };
    setJobs((old) => [job, ...old]);
    setEmployees((old) => old.map((e) => e.id === jobEmployee ? { ...e, status: settings.approvalRequired ? "Available" : "Working", task: job.title } : e));
    setJobTitle(""); setShowJobForm(false); notify(settings.approvalRequired ? "Job queued for approval" : "Job assigned");
  };
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || !activeConversation) return;
    const text = message.trim(); setMessage("");
    const sent: Message = { id: crypto.randomUUID(), from: "you", text, time: nowTime() };
    setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, sent] } : c));
    if (activeConversation.kind === "private" && activeConversation.members.length === 1) {
      const emp = employeeMap.get(activeConversation.members[0]);
      if (!emp) return;
      setBusy(true);
      try {
        let reply = "";
        if (window.puter?.ai?.chat) {
          const prompt = "You are " + emp.name + ", " + emp.role + " in a company workspace. Tone: " + emp.tone + ". Custom instructions: " + emp.instructions + ". Current task: " + (emp.task || "none") + ". Respond helpfully and concisely to this message: " + text;
          const model = emp.model.includes("Claude") ? "claude-sonnet-4" : emp.model === "GPT-4o" ? "gpt-4o" : "gpt-4o-mini";
          const result = await window.puter.ai.chat(prompt, { model });
          reply = typeof result === "string" ? result : String((result as { message?: { content?: unknown } })?.message?.content ?? "I’ve noted that. I’ll review and get back to you.");
        } else {
          reply = "I’ve received your message. To enable live AI replies, configure Puter.js in this deployment. I can still track jobs and updates here.";
        }
        const response: Message = { id: crypto.randomUUID(), from: emp.id, text: reply, time: nowTime() };
        setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, response] } : c));
      } catch {
        setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, { id: crypto.randomUUID(), from: emp.id, text: "I couldn’t reach the AI provider just now. Your message is saved; please try again shortly.", time: nowTime() }] } : c));
      } finally { setBusy(false); }
    }
  };
  const runJob = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || busy) return;
    const emp = employeeMap.get(job.employeeId);
    if (!emp) { notify("This job has no assigned employee"); return; }
    if (!window.puter?.ai?.chat) { notify("AI execution is unavailable: Puter.js did not load"); return; }
    setBusy(true);
    try {
      const prompt = "You are " + emp.name + ", " + emp.role + " working on a delegated job in a company workspace. Tone: " + emp.tone + ". Instructions: " + (emp.instructions || "Produce accurate, useful work and state assumptions.") + ".\\n\\nJOB: " + job.title + "\\n\\nProduce the actual deliverable for this job, not a plan to do it. Use clear headings and concrete content. Do not claim to have accessed external systems, files, or company data unless supplied in the prompt. State limitations explicitly.";
      const model = emp.model.includes("Claude") ? "claude-sonnet-4" : emp.model === "GPT-4o" ? "gpt-4o" : "gpt-4o-mini";
      const response = await window.puter.ai.chat(prompt, { model });
      const output = typeof response === "string" ? response : String((response as { message?: { content?: unknown } })?.message?.content ?? "");
      if (!output.trim()) throw new Error("The AI provider returned an empty deliverable.");
      setJobs((old) => old.map((j) => j.id === jobId ? { ...j, status: "Submitted", result: output, submittedAt: nowTime() } : j));
      setEmployees((old) => old.map((e) => e.id === emp.id ? { ...e, status: "Needs review", task: job.title } : e));
      setConversations((old) => old.map((c) => c.id === "team" ? { ...c, messages: [...c.messages, { id: crypto.randomUUID(), from: emp.id, text: "I’ve completed the deliverable for “" + job.title + "”. Open the job to inspect the actual work before approving it.", time: nowTime(), jobId }] } : c));
      setSelectedJobId(jobId);
      notify("Deliverable created — review the work");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not execute this job");
    } finally { setBusy(false); }
  };
  const approveJob = (jobId: string) => { setJobs((old) => old.map((j) => j.id === jobId ? { ...j, status: "Approved" } : j)); notify("Work approved"); };
  const createCompany = (event: FormEvent) => {
    event.preventDefault(); if (!companyName.trim()) return;
    const name = companyName.trim(); const item = { id: crypto.randomUUID(), name, industry: "New workspace", initials: initials(name), color: "blue", description: "Your new company workspace" };
    setCompanies((old) => [...old, item]); setCompanyName(""); setShowCompanyForm(false); openCompany(item);
  };
  const createEmployee = (event: FormEvent) => {
    event.preventDefault(); if (!employeeName.trim() || !employeeRole.trim()) return;
    const id = crypto.randomUUID();
    setEmployees((old) => [...old, { id, name: employeeName.trim(), role: employeeRole.trim(), deptId: newEmployeeDept || depts[0]?.id || "leadership", tone: "Clear & concise", model: "GPT-4o mini", instructions: "", status: "Available" }]);
    setEmployeeName(""); setEmployeeRole(""); setNewEmployeeDept("leadership"); setShowEmployeeForm(false); setSelectedEmployee(id); notify("Employee created");
  };
  const createConversation = (event: FormEvent) => {
    event.preventDefault(); if (!newChatName.trim()) return;
    const id = crypto.randomUUID(); const chat: Conversation = { id, name: newChatName.trim(), kind: newChatMembers.length > 1 ? "group" : "private", members: newChatMembers.length ? newChatMembers : ["maya"], messages: [] };
    setConversations((old) => [chat, ...old]); setSelectedChat(id); setNewChatName(""); setNewChatMembers([]); setShowChatForm(false); setPage("Communication");
  };
  const openChatWith = (id: string) => {
    const found = conversations.find((c) => c.members.length === 1 && c.members[0] === id && c.kind === "private");
    if (found) setSelectedChat(found.id);
    else {
      const e = employeeMap.get(id); const created: Conversation = { id: "private-" + id, name: e?.name ?? "Employee", kind: "private", members: [id], messages: [] };
      setConversations((old) => old.some((c) => c.id === created.id) ? old : [created, ...old]); setSelectedChat(created.id);
    }
    setPage("Communication");
  };
  const employeeNameFor = (id: string) => id === "you" ? "You" : employeeMap.get(id)?.name ?? "AutoBusiness";
  const filteredEmployees = employees.filter((e) => (e.name + " " + e.role).toLowerCase().includes(search.toLowerCase()));
  const departmentTree = (parent?: string, depth = 0): JSX.Element[] => depts.filter((d) => d.parentId === parent).flatMap((d) => {
    const members = filteredEmployees.filter((e) => e.deptId === d.id);
    const children = departmentTree(d.id, depth + 1);
    if (!members.length && !children.length) return [];
    return [<div className="department" key={d.id}>
      <div className="department-label" style={{ paddingLeft: 10 + depth * 14 }}><span className="department-dot" />{d.name}<span className="muted-count">{members.length}</span></div>
      {members.map((e) => <button className={"employee-row " + (selectedEmployee === e.id ? "selected" : "")} key={e.id} onClick={() => setSelectedEmployee(e.id)}><span className={"avatar small " + (e.status === "Working" ? "avatar-violet" : "")}>{initials(e.name)}</span><span className="employee-row-copy"><strong>{e.name}</strong><small>{e.role}</small></span><span className={"status-dot " + e.status.toLowerCase().replace(" ", "-")} /></button>)}
      {children}
    </div>];
  });

  if (!company) return <div className="home-shell">
    <header className="home-top"><div className="brand"><span className="brand-mark"><Command size={19} /></span><span>autobusiness</span></div><span className="workspace-chip"><span className="online-dot" /> Your workspace</span></header>
    <main className="home-content">
      <div className="eyebrow"><Sparkles size={14} /> YOUR AI OPERATING TEAM</div>
      <h1>Good work starts<br />with the right team.</h1>
      <p className="home-subtitle">Choose a company workspace to pick up where you left off.</p>
      <div className="company-grid">
        {companies.map((c) => <button className="company-card" key={c.id} onClick={() => { openCompany(c); }}>
          <div className={"company-icon " + c.color}>{c.initials}</div><div className="company-card-top"><strong>{c.name}</strong><ChevronRight size={17} /></div><span className="company-industry">{c.industry}</span><p>{c.description}</p><div className="company-card-footer"><span><Users size={14} /> {employees.length} employees</span><span className="workspace-open">Open workspace <ArrowUpRight size={14} /></span></div>
        </button>)}
        <button className="company-card add-company" onClick={() => setShowCompanyForm(true)}><span className="add-circle"><Plus size={20} /></span><strong>Create a company</strong><p>Start a new workspace for another business.</p></button>
      </div>
      <div className="home-footnote"><LockKeyhole size={13} /> Company workspaces are kept separate. Demo data is saved in this browser.</div>
    </main>
    {showCompanyForm && <div className="modal-backdrop" onClick={() => setShowCompanyForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createCompany}><button type="button" className="modal-close" onClick={() => setShowCompanyForm(false)}>×</button><h2>Create a company</h2><p>Give your workspace a name to get started.</p><label>Company name<input autoFocus value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Northstar Studio" required /></label><button className="primary-button" type="submit">Create workspace</button></form></div>}
  </div>;

  return <div className="app-shell">
    <header className="app-topbar">
      <div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar"><Command size={18} /></button><div className="brand compact"><span className="brand-mark"><Command size={17} /></span><span>autobusiness</span></div><span className="topbar-divider" /><button className="company-switcher" onClick={() => setCompany(null)}><span className={"company-mini " + company.color}>{company.initials}</span>{company.name}<ChevronDown size={14} /></button></div>
      <div className="topbar-right"><span className="saved-indicator"><span className="online-dot" /> All changes saved</span><button className="icon-button" title="Help" onClick={() => notify("Help centre coming soon")}><CircleHelp size={17} /></button><button className="profile-button" title="Your profile">AG</button></div>
    </header>
    <div className="app-body">
      {sidebarOpen && <aside className="sidebar">
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav">{nav.map(({ label, icon: Icon, count }) => <button key={label} className={"nav-item " + (page === label ? "active" : "")} onClick={() => changePage(label)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count ? <span className="nav-count">{count}</span> : null}</button>)}</nav>
        <div className="sidebar-divider" />
        {page === "Communication" ? <>
          <div className="side-section-head"><span>MESSAGES</span><button className="tiny-icon" onClick={() => setShowChatForm(true)} title="New chat"><Plus size={15} /></button></div>
          <button className={"chat-list-item " + (selectedChat === "team" ? "chosen" : "")} onClick={() => setSelectedChat("team")}><span className="chat-avatar team-avatar"><Users size={15} /></span><span className="chat-label"><strong>Company team</strong><small>Group conversation</small></span></button>
          {conversations.filter((c) => c.id !== "team").map((c) => <button key={c.id} className={"chat-list-item " + (selectedChat === c.id ? "chosen" : "")} onClick={() => setSelectedChat(c.id)}><span className="avatar tiny">{initials(c.name)}</span><span className="chat-label"><strong>{c.name}</strong><small>{c.messages.at(-1)?.text ?? "Start a conversation"}</small></span></button>)}
          <button className="side-new-button" onClick={() => setShowChatForm(true)}><Plus size={14} /> New conversation</button>
        </> : page === "Employees" ? <>
          <div className="side-section-head"><span>YOUR TEAM</span><button className="tiny-icon" onClick={() => setShowEmployeeForm(true)} title="Add employee"><Plus size={15} /></button></div>
          <div className="employee-search"><Search size={14} /><input placeholder="Find an employee" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="department-list">{departmentTree()}</div><button className="side-new-button" onClick={() => setShowEmployeeForm(true)}><Plus size={14} /> Add employee</button>
        </> : page === "Settings" ? <>
          <div className="side-section-head"><span>SETTINGS</span></div>
          {["General", "Security", "Rulesets", "Connectors", "Automation & limits"].map((item) => <button key={item} className={"nav-item subnav " + (activeSettings === item ? "active" : "")} onClick={() => setActiveSettings(item)}><span>{item}</span></button>)}
        </> : <>
          <div className="side-section-head"><span>QUICK ACCESS</span></div>
          <button className="quick-link" onClick={() => changePage("Jobs & approvals")}><Inbox size={15} /><span>Needs your review</span><span className="nav-count">{jobs.filter((j) => j.status === "Submitted").length}</span></button>
          <button className="quick-link" onClick={() => { setSelectedChat("team"); changePage("Communication"); }}><MessageCircle size={15} /><span>Team messages</span></button>
          <div className="side-card"><div className="side-card-icon"><Zap size={15} /></div><strong>Your AI team</strong><p>Delegate work, review submissions, and keep everything moving.</p><button onClick={() => setShowJobForm(true)}>Assign a job <ArrowUpRight size={13} /></button></div>
        </>}
        <div className="sidebar-bottom"><div className="usage-mini"><div className="usage-mini-top"><span>MONTHLY USAGE</span><span>{Math.min(64, settings.monthlyLimit)} / {settings.monthlyLimit}</span></div><div className="usage-track"><span style={{ width: Math.min(100, 64 / Math.max(settings.monthlyLimit, 1) * 100) + "%" }} /></div><small>Estimated usage units</small></div><button className="sidebar-company" onClick={() => setCompany(null)}><span className={"company-mini " + company.color}>{company.initials}</span><span><strong>{company.name}</strong><small>Free workspace</small></span><MoreHorizontal size={17} /></button></div>
      </aside>}
      <main className="main-panel">
        {page === "Dashboard" && <div className="page-wrap">
          <div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Overview</div><h1>Good afternoon, Andy <span className="wave">✳</span></h1><p>Here’s what’s happening across {company.name} today.</p></div><button className="primary-button" onClick={() => setShowJobForm(true)}><Plus size={16} /> Assign a job</button></div>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-card-top"><span>Active employees</span><span className="stat-icon lavender"><Users size={17} /></span></div><div className="stat-value">{employees.length}<span className="stat-trend positive"><ArrowUpRight size={13} /> 2</span></div><div className="stat-caption">{employees.filter((e) => e.status === "Working").length} working right now</div></div>
            <div className="stat-card"><div className="stat-card-top"><span>Jobs in progress</span><span className="stat-icon blue-bg"><Activity size={17} /></span></div><div className="stat-value">{jobs.filter((j) => j.status === "In progress" || j.status === "Queued").length}<span className="stat-trend">{jobs.filter((j) => j.status === "Queued").length} queued</span></div><div className="stat-caption">Across all departments</div></div>
            <div className="stat-card"><div className="stat-card-top"><span>Awaiting review</span><span className="stat-icon amber-bg"><Inbox size={17} /></span></div><div className="stat-value">{jobs.filter((j) => j.status === "Submitted").length}<span className="stat-trend attention">Needs attention</span></div><div className="stat-caption">Submitted by your team</div></div>
            <div className="stat-card"><div className="stat-card-top"><span>Monthly usage</span><span className="stat-icon green-bg"><Gauge size={17} /></span></div><div className="stat-value">64<span className="stat-unit">units</span></div><div className="usage-track stat-track"><span style={{ width: Math.min(100, 64 / Math.max(settings.monthlyLimit, 1) * 100) + "%" }} /></div><div className="stat-caption">{settings.monthlyLimit - 64 > 0 ? settings.monthlyLimit - 64 : 0} units remaining</div></div>
          </div>
          <div className="dashboard-grid">
            <section className="panel jobs-panel"><div className="panel-heading"><div><h2>Jobs & requests</h2><p>Keep an eye on what needs attention.</p></div><button className="text-button" onClick={() => changePage("Jobs & approvals")}>View all <ArrowUpRight size={14} /></button></div>
              <div className="job-list">{jobs.slice(0, 4).map((job) => { const emp = employeeMap.get(job.employeeId); return <div className="job-row" key={job.id}><span className="avatar">{initials(emp?.name ?? "AI")}</span><div className="job-copy"><strong>{job.title}</strong><span>{emp?.name ?? "Unassigned"} <span className="dot-sep">·</span> {job.created}</span></div><span className={"job-status " + job.status.toLowerCase().replace(" ", "-")}>{job.status}</span>{job.status === "Submitted" && <button className="secondary-button compact-button" onClick={() => setSelectedJobId(job.id)}>View work</button>}</div>; })}</div>
              {jobs.length === 0 && <div className="empty-state">No jobs yet. Assign your first task to get started.</div>}
              <button className="panel-footer-link" onClick={() => setShowJobForm(true)}><Plus size={15} /> Create a new job</button>
            </section>
            <section className="panel team-panel"><div className="panel-heading"><div><h2>Your team</h2><p>A quick look at your employees.</p></div><button className="text-button" onClick={() => changePage("Employees")}>All employees <ArrowUpRight size={14} /></button></div>
              <div className="team-list">{employees.slice(0, 5).map((e) => <button className="team-person" key={e.id} onClick={() => { setSelectedEmployee(e.id); setPage("Employees"); }}><span className="avatar">{initials(e.name)}</span><span className="team-person-copy"><strong>{e.name}</strong><small>{e.role}</small></span><span className={"presence " + e.status.toLowerCase().replace(" ", "-")}><i />{e.status}</span></button>)}</div>
            </section>
            <section className="panel goals-panel"><div className="panel-heading"><div><h2>Goals & progress</h2><p>What the team is moving towards.</p></div><button className="icon-button subtle" onClick={() => notify("Goal editing coming soon")}><MoreHorizontal size={17} /></button></div>
              <div className="goal-item"><div className="goal-top"><span className="goal-mark purple-mark"><ArrowUpRight size={14} /></span><div><strong>Launch Q4 campaign</strong><small>Creative · Due Nov 15</small></div><b>68%</b></div><div className="goal-progress"><span style={{ width: "68%" }} /></div></div>
              <div className="goal-item"><div className="goal-top"><span className="goal-mark green-mark"><Activity size={14} /></span><div><strong>Improve activation rate</strong><small>Growth · Due Nov 30</small></div><b>42%</b></div><div className="goal-progress"><span className="progress-green" style={{ width: "42%" }} /></div></div>
              <button className="panel-footer-link" onClick={() => notify("Goal creation is coming soon")}><Plus size={15} /> Add a goal</button>
            </section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Updates from across your workspace.</p></div><Clock3 size={16} className="muted-icon" /></div>
              <div className="activity-list"><div className="activity-item"><span className="activity-bullet violet-bullet"><CheckCheck size={13} /></span><div><p><strong>Noah Williams</strong> submitted the weekly growth report</p><small>28 minutes ago</small></div></div><div className="activity-item"><span className="activity-bullet blue-bullet"><MessageCircle size={13} /></span><div><p><strong>Leo Martin</strong> posted an update in Company team</p><small>42 minutes ago</small></div></div><div className="activity-item"><span className="activity-bullet green-bullet"><Users size={13} /></span><div><p><strong>Maya Chen</strong> checked in with the team</p><small>1 hour ago</small></div></div></div>
            </section>
          </div>
        </div>}
        {page === "Employees" && <div className="page-wrap employees-page">
          <div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> People</div><h1>Employees</h1><p>Your AI team, organised by department.</p></div><button className="primary-button" onClick={() => setShowEmployeeForm(true)}><Plus size={16} /> Add employee</button></div>
          <div className="employee-layout"><div className="panel employee-directory"><div className="directory-top"><div><h2>Team directory</h2><p>{employees.length} employees · {depts.length} departments</p></div><div className="directory-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team" /></div></div>
            {depts.filter((d) => !d.parentId).map((dept) => { const childDepts = depts.filter((d) => d.parentId === dept.id); const deptEmployees = filteredEmployees.filter((e) => e.deptId === dept.id || childDepts.some((cd) => cd.id === e.deptId)); if (!deptEmployees.length) return null; return <div className="directory-dept" key={dept.id}><div className="directory-dept-title"><span className="department-dot" />{dept.name}<span>{deptEmployees.length}</span></div>{deptEmployees.map((e) => <button key={e.id} className={"directory-person " + (selectedEmployee === e.id ? "selected" : "")} onClick={() => setSelectedEmployee(e.id)}><span className="avatar">{initials(e.name)}</span><span className="directory-person-copy"><strong>{e.name}</strong><small>{e.role} · {depts.find((d) => d.id === e.deptId)?.name}</small></span><span className={"presence " + e.status.toLowerCase().replace(" ", "-")}><i />{e.status}</span><ChevronRight size={15} /></button>)}</div>; })}
          </div>
          {activeEmployee && <section className="panel employee-detail"><div className="employee-profile-head"><div className="avatar large">{initials(activeEmployee.name)}</div><div className="employee-profile-title"><h2>{activeEmployee.name}</h2><p>{activeEmployee.role}</p><span className={"presence " + activeEmployee.status.toLowerCase().replace(" ", "-")}><i />{activeEmployee.status}</span></div><button className="icon-button subtle" onClick={() => notify("More employee actions coming soon")}><MoreHorizontal size={18} /></button></div>
            <button className="primary-button full-button" onClick={() => openChatWith(activeEmployee.id)}><MessageCircle size={16} /> Open conversation</button>
            <button className="secondary-button full-button" onClick={() => { setJobEmployee(activeEmployee.id); setShowJobForm(true); }}><Plus size={15} /> Assign a job</button>
            <div className="detail-divider" /><div className="detail-section-title">CURRENT STATUS</div><div className="status-summary"><span className={"status-pulse " + activeEmployee.status.toLowerCase().replace(" ", "-")} /><div><strong>{activeEmployee.status}</strong><small>{activeEmployee.task ? "Currently focused on " + activeEmployee.task : "No active task assigned"}</small></div></div>
            <div className="detail-section-title">QUEUED JOBS</div>
            {jobs.filter((job) => job.employeeId === activeEmployee.id && ["Queued", "In progress", "Submitted"].includes(job.status)).map((job) => <div className="employee-job-mini" key={job.id}><span className="employee-job-copy"><strong>{job.title}</strong><small>{job.created}</small></span><span className={"job-status " + job.status.toLowerCase().replace(" ", "-")}>{job.status}</span></div>)}
            {!jobs.some((job) => job.employeeId === activeEmployee.id && ["Queued", "In progress", "Submitted"].includes(job.status)) && <p className="no-open-jobs">No open jobs assigned.</p>}
            <div className="detail-section-title">AI CONFIGURATION</div><label className="field-label">Department<select value={activeEmployee.deptId} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, deptId: e.target.value } : x))}>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="field-label">Communication tone<select value={activeEmployee.tone} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, tone: e.target.value } : x))}><option>Clear & concise</option><option>Thoughtful & creative</option><option>Warm & articulate</option><option>Analytical</option><option>Practical & direct</option><option>Curious & collaborative</option><option>Formal</option><option>Friendly</option></select></label>
            <label className="field-label">AI model<select value={activeEmployee.model} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, model: e.target.value } : x))}><option>GPT-4o mini</option><option>GPT-4o</option><option>Claude Sonnet</option><option>Auto</option></select></label>
            <label className="field-label">Custom instructions<textarea rows={4} value={activeEmployee.instructions} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, instructions: e.target.value } : x))} placeholder="How should this employee work?" /></label>
            <div className="detail-note"><ShieldCheck size={15} /><span>Changes are saved automatically in this browser.</span></div>
          </section>}
          </div>
        </div>}
        {page === "Communication" && <div className="chat-page">
          <div className="chat-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Communication</div><h1>Communication</h1><p>Talk to your team and coordinate work in one place.</p></div><button className="primary-button" onClick={() => setShowChatForm(true)}><Plus size={16} /> New conversation</button></div>
          <div className="chat-window panel"><div className="chat-main-head">{activeConversation && <><span className={"chat-avatar " + (activeConversation.kind === "group" ? "team-avatar" : "")}>{activeConversation.kind === "group" ? <Users size={17} /> : initials(activeConversation.name)}</span><div><strong>{activeConversation.name}</strong><small>{activeConversation.kind === "group" ? activeConversation.members.length + " team members" : "Private conversation"}</small></div></>}<button className="icon-button subtle" onClick={() => notify("Conversation details coming soon")}><MoreHorizontal size={18} /></button></div>
            <div className="message-stream">{activeConversation?.messages.map((m) => <div key={m.id} className={"message-row " + (m.from === "you" ? "mine" : "")}><span className="avatar tiny">{initials(employeeNameFor(m.from))}</span><div className="message-content"><div className="message-meta"><strong>{employeeNameFor(m.from)}</strong><span>{m.time}</span></div><div className="message-bubble">{m.text}</div>{m.jobId && <button className="message-job-link" onClick={() => { changePage("Jobs & approvals"); setSelectedJobId(m.jobId ?? null); }}><Inbox size={13} /> View job and deliverable</button>}</div></div>)}
              {busy && <div className="typing-indicator"><span /><span /><span /> {activeConversation?.name} is thinking…</div>}
              {!activeConversation?.messages.length && <div className="chat-empty"><span className="chat-empty-icon"><MessageCircle size={22} /></span><strong>Start the conversation</strong><p>Send a message or assign a job to this chat.</p></div>}
            </div>
            <div className="chat-composer-area"><div className="composer-tools"><button onClick={() => { setJobEmployee(activeConversation?.members[0] ?? "maya"); setShowJobForm(true); }}><Plus size={14} /> Assign a job</button><span>Messages are saved in this browser</span></div><form className="chat-composer" onSubmit={sendMessage}><textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement)?.requestSubmit(); } }} placeholder={"Message " + (activeConversation?.name ?? "your team") + "…"} rows={2} /><button className="send-button" type="submit" disabled={!message.trim() || busy} aria-label="Send message"><Send size={17} /></button></form><small className="composer-hint">Enter to send · Shift + Enter for a new line</small></div>
          </div>
        </div>}
        {page === "Jobs & approvals" && <div className="page-wrap"><div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Operations</div><h1>Jobs & approvals</h1><p>Track delegated work and review submitted results.</p></div><button className="primary-button" onClick={() => setShowJobForm(true)}><Plus size={16} /> Assign a job</button></div><div className="job-filters"><span>{jobs.length} total jobs</span><span className="filter-pill">{jobs.filter((j) => j.status === "Queued").length} queued</span><span className="filter-pill review">{jobs.filter((j) => j.status === "Submitted").length} awaiting review</span></div><div className="panel all-jobs">{jobs.map((j) => { const emp = employeeMap.get(j.employeeId); return <div className="all-job-row" key={j.id}><span className="avatar">{initials(emp?.name ?? "AI")}</span><div className="all-job-copy"><strong>{j.title}</strong><small>Assigned to {emp?.name ?? "Unassigned"} · {j.created}</small></div><span className={"job-status " + j.status.toLowerCase().replace(" ", "-")}>{j.status}</span>{j.status === "Queued" && <button className="secondary-button compact-button" onClick={() => { setJobs((old) => old.map((x) => x.id === j.id ? { ...x, status: "In progress" } : x)); notify("Job started"); }}>Start job</button>}{j.status === "In progress" && <button className="secondary-button compact-button" disabled={busy} onClick={() => void runJob(j.id)}>{busy ? "Working…" : "Generate work"}</button>}{j.status === "Submitted" && <button className="secondary-button compact-button" onClick={() => setSelectedJobId(j.id)}>Review work</button>}{j.status === "Approved" && <span className="approved-check"><CheckCheck size={16} /> Complete</span>}</div>; })}{jobs.length === 0 && <div className="empty-state">No jobs created yet.</div>}</div></div>}
        {page === "Settings" && <div className="page-wrap settings-page"><div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Configuration</div><h1>Settings</h1><p>Configure how your AI team works and what it can access.</p></div><span className="saved-badge"><Check size={13} /> Saved automatically</span></div><div className="settings-layout"><div className="settings-tabs">{["General", "Security", "Rulesets", "Connectors", "Automation & limits"].map((item) => <button className={activeSettings === item ? "active" : ""} key={item} onClick={() => setActiveSettings(item)}>{item}</button>)}</div><section className="panel settings-content">
          {activeSettings === "General" && <><h2>General preferences</h2><p className="settings-intro">Manage the basics for {company.name}.</p><label className="field-label">Company name<input value={company.name} onChange={(e) => { const updated = { ...company, name: e.target.value }; setCompany(updated); setCompanies((old) => old.map((item) => item.id === updated.id ? updated : item)); }} /></label><div className="settings-info-row"><div><strong>Workspace appearance</strong><small>Clean, light interface optimised for daily work.</small></div><span className="setting-pill">Light</span></div><div className="settings-info-row"><div><strong>Data storage</strong><small>Demo mode stores changes in this browser. Configure Supabase for shared, multi-user persistence.</small></div><span className="setting-pill warning">Local demo</span></div></>}
          {activeSettings === "Security" && <><h2>Security & permissions</h2><p className="settings-intro">Keep sensitive work under control.</p><div className="setting-toggle-row"><div><strong>Require approval before jobs run</strong><small>New assignments wait for a human to approve before they begin.</small></div><button className={"toggle " + (settings.approvalRequired ? "on" : "")} onClick={() => setSettings({ ...settings, approvalRequired: !settings.approvalRequired })}><span /></button></div><div className="settings-info-row"><div><strong>External actions</strong><small>External publishing and connector writes should require explicit approval.</small></div><span className="setting-pill">Approval gated</span></div><div className="settings-info-row"><div><strong>Credentials</strong><small>Never store provider secrets in frontend code. Use server-side secrets for production.</small></div><span className="setting-pill">Protected</span></div></>}
          {activeSettings === "Rulesets" && <><h2>Rulesets</h2><p className="settings-intro">Company-wide guardrails applied to every employee.</p><div className="rule-card"><span className="rule-icon"><ShieldCheck size={17} /></span><div><strong>Human approval for consequential actions</strong><small>Publishing, sending messages externally, spending and deleting data require confirmation.</small></div><span className="setting-pill green-pill">Enabled</span></div><div className="rule-card"><span className="rule-icon"><LockKeyhole size={17} /></span><div><strong>Keep company data private</strong><small>Employees should only use the context required for their assigned work.</small></div><span className="setting-pill green-pill">Enabled</span></div><div className="rule-card"><span className="rule-icon"><CheckCheck size={17} /></span><div><strong>Require evidence in submissions</strong><small>Ask employees to include the result, relevant links and unresolved issues.</small></div><span className="setting-pill green-pill">Enabled</span></div><button className="secondary-button" onClick={() => notify("Ruleset editor is planned for the next iteration")}><Plus size={14} /> Add custom ruleset</button></>}
          {activeSettings === "Connectors" && <><h2>Enabled connectors</h2><p className="settings-intro">Manage services your company workspace can use.</p>{["Puter AI", "Supabase", "GitHub", "Google Drive", "Slack", "Web search"].map((name) => <div className="connector-row" key={name}><span className="connector-icon">{name === "Puter AI" ? <Sparkles size={17} /> : name === "Supabase" ? <Zap size={17} /> : name === "GitHub" ? <Command size={17} /> : <Workflow size={17} />}</span><div><strong>{name}</strong><small>{name === "Puter AI" ? "AI chat and model access in the browser" : name === "Supabase" ? "Database and authentication (not connected in demo mode)" : name === "GitHub" ? "Repository and delivery workflows" : "Available to connect in a future iteration"}</small></div><button className={"connector-action " + (settings.connectors.includes(name) ? "enabled" : "")} onClick={() => setSettings({ ...settings, connectors: settings.connectors.includes(name) ? settings.connectors.filter((x) => x !== name) : [...settings.connectors, name] })}>{settings.connectors.includes(name) ? <><Check size={13} /> Enabled</> : "Enable"}</button></div>)}</>}
          {activeSettings === "Automation & limits" && <><h2>Automation & usage limits</h2><p className="settings-intro">Choose how much work can run without interrupting you.</p><div className="setting-toggle-row"><div><strong>Allow automatic job execution</strong><small>When enabled, eligible jobs can start without a manual approval.</small></div><button className={"toggle " + (settings.autoRun ? "on" : "")} onClick={() => setSettings({ ...settings, autoRun: !settings.autoRun, approvalRequired: settings.autoRun ? true : settings.approvalRequired })}><span /></button></div><label className="field-label">Daily usage limit (units)<input type="number" min="1" max="10000" value={settings.dailyLimit} onChange={(e) => setSettings({ ...settings, dailyLimit: Math.max(1, Number(e.target.value)) })} /></label><label className="field-label">Monthly usage limit (units)<input type="number" min="1" max="100000" value={settings.monthlyLimit} onChange={(e) => setSettings({ ...settings, monthlyLimit: Math.max(1, Number(e.target.value)) })} /></label><div className="usage-summary"><div className="usage-summary-top"><span>Estimated monthly usage</span><strong>64 / {settings.monthlyLimit} units</strong></div><div className="usage-track"><span style={{ width: Math.min(100, 64 / Math.max(settings.monthlyLimit, 1) * 100) + "%" }} /></div></div><p className="small-disclaimer">Usage figures are illustrative in demo mode. Live provider billing is not yet connected.</p></>}
        </section></div></div>}
      </main>
    </div>
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
    {selectedJobId && (() => { const j = jobs.find((item) => item.id === selectedJobId); if (!j) return null; const emp = employeeMap.get(j.employeeId); return <div className="modal-backdrop" onClick={() => setSelectedJobId(null)}><section className="modal work-modal" role="dialog" aria-modal="true" aria-labelledby="work-modal-title" onClick={(e) => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSelectedJobId(null)} aria-label="Close work review">×</button><span className="modal-kicker"><Inbox size={14} /> DELIVERABLE REVIEW</span><h2 id="work-modal-title">{j.title}</h2><p>Assigned to {emp?.name ?? "Unassigned"} · {j.status}{j.submittedAt ? " · Submitted " + j.submittedAt : ""}</p><div className="work-result">{j.result?.trim() || "No deliverable has been generated yet. Start the job and generate work before reviewing or approving it."}</div><div className="work-modal-actions"><button className="secondary-button" onClick={() => setSelectedJobId(null)}>Close</button>{j.status === "In progress" && <button className="primary-button" disabled={busy} onClick={() => void runJob(j.id)}>{busy ? "Generating…" : "Generate work"}</button>}{j.status === "Submitted" && <button className="primary-button" disabled={!j.result?.trim()} onClick={() => { if (j.result?.trim()) { approveJob(j.id); setSelectedJobId(null); } }}><Check size={14} /> Approve reviewed work</button>}</div></section></div>; })()}\n    {showJobForm && <div className="modal-backdrop" onClick={() => setShowJobForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createJob}><button type="button" className="modal-close" onClick={() => setShowJobForm(false)}>×</button><span className="modal-kicker"><Inbox size={14} /> JOB ASSIGNMENT</span><h2>Assign a job</h2><p>Give an employee a clear outcome to work towards.</p><label>Job title<input autoFocus value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Draft a launch plan" required /></label><label>Assign to<select value={jobEmployee} onChange={(e) => setJobEmployee(e.target.value)}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}</select></label><div className="modal-note"><ShieldCheck size={15} />{settings.approvalRequired ? "This job will be queued for approval before running." : "This job will be marked in progress immediately."}</div><button className="primary-button modal-submit" type="submit">Create job <ArrowUpRight size={15} /></button></form></div>}
    {showEmployeeForm && <div className="modal-backdrop" onClick={() => setShowEmployeeForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createEmployee}><button type="button" className="modal-close" onClick={() => setShowEmployeeForm(false)}>×</button><span className="modal-kicker"><Users size={14} /> TEAM SETUP</span><h2>Add an employee</h2><p>Create a new AI teammate for this workspace.</p><label>Full name<input autoFocus value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="e.g. Sam Taylor" required /></label><label>Role<input value={employeeRole} onChange={(e) => setEmployeeRole(e.target.value)} placeholder="e.g. Research analyst" required /></label><label>Department<select value={newEmployeeDept} onChange={(e) => setNewEmployeeDept(e.target.value)}>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><button className="primary-button modal-submit" type="submit">Create employee <Plus size={15} /></button></form></div>}
    {showChatForm && <div className="modal-backdrop" onClick={() => setShowChatForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createConversation}><button type="button" className="modal-close" onClick={() => setShowChatForm(false)}>×</button><span className="modal-kicker"><MessageCircle size={14} /> COMMUNICATION</span><h2>New conversation</h2><p>Start a private chat or bring a few employees together.</p><label>Conversation name<input autoFocus value={newChatName} onChange={(e) => setNewChatName(e.target.value)} placeholder="e.g. Website launch" required /></label><label>Invite employees<select multiple value={newChatMembers} onChange={(e) => setNewChatMembers(Array.from(e.target.selectedOptions, (o) => o.value))}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}</select><small className="input-help">Choose one employee for a private chat, or several for a group.</small></label><button className="primary-button modal-submit" type="submit">Create conversation <ArrowUpRight size={15} /></button></form></div>}
  </div>;
}
