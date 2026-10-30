import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, Bot, Building2, Check,
  CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Command, Gauge,
  Inbox, LayoutDashboard, LockKeyhole, Menu, MessageCircle, MoreHorizontal, Plus,
  Search, Send, Settings2, ShieldCheck, Sparkles, Users, Workflow, Zap
} from "lucide-react";
import "./styles.css";
import { supabase } from "./supabase";


function MarkdownPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Array<{ type: string; text: string; level?: number }> = [];
  let codeLines: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (/^\s*~~~|^\s*\x60\x60\x60/.test(line)) {
      if (inCode) { blocks.push({ type: "code", text: codeLines.join("\n") }); codeLines = []; inCode = false; }
      else inCode = true;
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!line.trim()) { blocks.push({ type: "space", text: "" }); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { blocks.push({ type: "heading", text: heading[2], level: heading[1].length }); continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: "rule", text: "" }); continue; }
    if (/^\s*>\s?/.test(line)) { blocks.push({ type: "quote", text: line.replace(/^\s*>\s?/, "") }); continue; }
    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (task) { blocks.push({ type: "task", text: task[2], level: task[1].toLowerCase() === "x" ? 1 : 0 }); continue; }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) { blocks.push({ type: "bullet", text: bullet[1] }); continue; }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) { blocks.push({ type: "ordered", text: ordered[1] }); continue; }
    blocks.push({ type: "paragraph", text: line });
  }
  if (inCode) blocks.push({ type: "code", text: codeLines.join("\n") });
  const inline = (value: string): React.ReactNode[] => value.split(/(\*\*[^*]+\*\*|__[^_]+__|\x60[^\x60]+\x60|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("\x60") && part.endsWith("\x60")) return <code key={index}>{part.slice(1, -1)}</code>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
  return <div className="markdown-preview">{blocks.map((block, index) => {
    if (block.type === "space") return <div className="markdown-space" key={index} />;
    if (block.type === "heading") { const level = Math.min(block.level ?? 2, 4); if (level === 1) return <h1 key={index}>{inline(block.text)}</h1>; if (level === 2) return <h2 key={index}>{inline(block.text)}</h2>; if (level === 3) return <h3 key={index}>{inline(block.text)}</h3>; return <h4 key={index}>{inline(block.text)}</h4>; }
    if (block.type === "task") return <div className="markdown-list-item task" key={index}><input type="checkbox" checked={block.level === 1} readOnly aria-label={block.level === 1 ? "Completed item" : "Incomplete item"} /><div>{inline(block.text)}</div></div>;
    if (block.type === "bullet") return <div className="markdown-list-item bullet" key={index}><span>•</span><div>{inline(block.text)}</div></div>;
    if (block.type === "ordered") return <div className="markdown-list-item ordered" key={index}><span>{index + 1}.</span><div>{inline(block.text)}</div></div>;
    if (block.type === "code") return <pre key={index}><code>{block.text}</code></pre>;
    if (block.type === "quote") return <blockquote key={index}>{inline(block.text)}</blockquote>;
    if (block.type === "rule") return <hr key={index} />;
    return <p key={index}>{inline(block.text)}</p>;
  })}</div>;
}


type Employee = { id: string; name: string; role: string; deptId: string; managerId?: string; tone: string; model: string; instructions: string; status: "Available" | "Working" | "Needs review" | "Paused"; task?: string };
type Dept = { id: string; name: string; parentId?: string };
type Job = { id: string; title: string; description?: string; employeeId: string; status: "Queued" | "In progress" | "Submitted" | "Approved" | "Rejected"; priority: "Normal" | "Urgent"; created: string; result?: string; submittedAt?: string; reviewNote?: string; createdBy?: string; reviewedBy?: string };
type Message = { id: string; from: string; text: string; time: string; jobId?: string; createdAt?: string; senderUserId?: string };
type Conversation = { id: string; name: string; kind: "private" | "group"; members: string[]; messages: Message[]; createdBy?: string };
type Company = { id: string; name: string; industry: string; initials: string; color: string; description: string };
type Goal = { id: string; title: string; description: string; progress: number; dueDate?: string; status: "planned" | "active" | "paused" | "completed"; createdBy?: string };
type AuthUser = { id: string; email?: string };
type Settings = { approvalRequired: boolean; dailyLimit: number; monthlyLimit: number; autoRun: boolean; connectors: string[] };

const seedDepts: Dept[] = [
  { id: "leadership", name: "Leadership" }, { id: "creative", name: "Creative" },
  { id: "growth", name: "Growth" }, { id: "operations", name: "Operations" },
  { id: "content", name: "Content", parentId: "creative" }, { id: "design", name: "Design", parentId: "creative" }
];
const seedEmployees: Employee[] = [
  { id: "maya", name: "Maya Chen", role: "Chief of Staff", deptId: "leadership", tone: "Clear & concise", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "Prioritise the highest-impact work. Ask before making external commitments.", status: "Available" },
  { id: "leo", name: "Leo Martin", role: "Brand Strategist", deptId: "creative", managerId: "maya", tone: "Thoughtful & creative", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "Ground recommendations in audience insight and brand strategy.", status: "Working", task: "Q4 campaign positioning" },
  { id: "amara", name: "Amara Okafor", role: "Content Lead", deptId: "content", managerId: "leo", tone: "Warm & articulate", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "Write clearly, avoid clichés, and verify claims.", status: "Available" },
  { id: "noah", name: "Noah Williams", role: "Growth Analyst", deptId: "growth", managerId: "maya", tone: "Analytical", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "Show assumptions and use measurable outcomes.", status: "Needs review", task: "Weekly growth report" },
  { id: "ella", name: "Ella Rossi", role: "Operations Manager", deptId: "operations", managerId: "maya", tone: "Practical & direct", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "Prefer repeatable processes and concise checklists.", status: "Available" },
  { id: "jules", name: "Jules Park", role: "Product Designer", deptId: "design", managerId: "leo", tone: "Curious & collaborative", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "Explain trade-offs and design for accessibility.", status: "Available" }
];
const defaultSettings: Settings = { approvalRequired: true, dailyLimit: 50, monthlyLimit: 900, autoRun: true, connectors: ["OpenRouter", "Supabase"] };
const demoCompany: Company = { id: "demo-company", name: "Northstar Studio", industry: "Creative services", initials: "NS", color: "blue", description: "Interactive sample workspace" };
const makeDemoJobs = (): Job[] => {
  const now = Date.now();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  return [
    { id: "demo-job-review", title: "Q4 campaign positioning", description: "Recommend a positioning direction for a small creative studio, including audience, message, and proof points.", employeeId: "leo", status: "Submitted", priority: "Urgent", created: yesterday, submittedAt: yesterday, result: "# Q4 campaign positioning\n\n**Recommendation:** Lead with a clear, customer-centred promise and support it with practical evidence.\n\n## Audience\nSmall teams that need reliable creative support without adding operational complexity.\n\n## Message\nMake the next stage of growth easier to execute.\n\n## Next steps\nValidate the message with three existing customers, then use their language in the landing page and campaign brief.\n\n*This is illustrative demo content, not generated business advice.*" },
    { id: "demo-job-queued", title: "Benchmark competitor onboarding", description: "Prepare a concise comparison checklist for evaluating competitor onboarding flows.", employeeId: "maya", status: "Queued", priority: "Normal", created: new Date(now - 30 * 60 * 1000).toISOString() },
    { id: "demo-job-progress", title: "Outline customer onboarding", description: "Draft an onboarding sequence with the first three customer milestones.", employeeId: "amara", status: "In progress", priority: "Normal", created: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
    { id: "demo-job-approved", title: "Weekly growth summary", description: "Summarise the signals to check in a weekly growth review.", employeeId: "noah", status: "Approved", priority: "Normal", created: twoDaysAgo, submittedAt: twoDaysAgo, result: "# Weekly growth summary\n\nReview acquisition, activation, retention, and conversion as separate stages. For each stage, record the baseline, the change from the prior period, and the next experiment.\n\n*Illustrative demo content.*" }
  ];
};
const makeDemoConversations = (): Conversation[] => [
  { id: "demo-group", name: "Company team", kind: "group", members: ["maya", "leo", "amara", "noah"], messages: [
    { id: "demo-msg-1", from: "you", text: "Can we agree on one clear message for the next campaign?", time: "09:14", createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
    { id: "demo-msg-2", from: "leo", text: "I’m comparing the current positioning with the questions customers ask most often. I’ll bring a recommendation and supporting points back for review.", time: "09:16", createdAt: new Date(Date.now() - 88 * 60 * 1000).toISOString() },
    { id: "demo-msg-3", from: "noah", text: "I’ll check which measures could tell us whether the message is working, rather than relying on clicks alone.", time: "09:18", createdAt: new Date(Date.now() - 86 * 60 * 1000).toISOString() }
  ] },
  { id: "demo-private-leo", name: "Leo Martin", kind: "private", members: ["leo"], messages: [
    { id: "demo-msg-4", from: "you", text: "Please keep recommendations practical and explain the trade-offs.", time: "Yesterday", createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() },
    { id: "demo-msg-5", from: "leo", text: "Understood. I’ll distinguish the strongest option from the alternatives and note what evidence would validate the choice.", time: "Yesterday", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }
  ] },
  { id: "demo-private-maya", name: "Maya Chen", kind: "private", members: ["maya"], messages: [] }
];
const makeDemoGoals = (): Goal[] => [
  { id: "demo-goal-1", title: "Clarify our core positioning", description: "Validate the main value proposition with customers.", progress: 65, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), status: "active" },
  { id: "demo-goal-2", title: "Make onboarding more consistent", description: "Document a simple first-week customer journey.", progress: 30, status: "active" }
];
const fallbackFreeModels = [{ id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)" }, { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B (free)" }, { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1 (free)" }];
const openRouterKeyName = "autobusiness_openrouter_api_key";
const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const describeError = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    const value = error as { message: string; code?: string; details?: string; hint?: string };
    return [value.message, value.code ? `(${value.code})` : "", value.details || "", value.hint ? `Hint: ${value.hint}` : ""].filter(Boolean).join(" ");
  }
  return fallback;
};
const requestOpenRouter = async (model: string, messages: Array<{ role: string; content: string }>, apiKey: string, onChunk?: (text: string) => void): Promise<string> => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Authorization": "Bearer " + apiKey.trim(), "Content-Type": "application/json", "HTTP-Referer": window.location.origin, "X-Title": "AutoBusiness" }, body: JSON.stringify({ model, messages, temperature: 0.4, stream: true }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `OpenRouter request failed (${response.status})`);
  }
  if (!response.body) throw new Error("Streaming is unavailable for this response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta?.content;
        const token = typeof delta === "string" ? delta : Array.isArray(delta) ? delta.map((part: { text?: string }) => part?.text ?? "").join("") : "";
        if (token) { result += token; onChunk?.(token); }
      } catch { /* Ignore non-content SSE frames. */ }
    }
  }
  return result;
};
const partialJsonField = (source: string, field: string) => {
  const match = source.match(new RegExp('"' + field + '"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)'));
  if (!match) return "";
  try { return JSON.parse('"' + match[1] + '"'); } catch { return match[1].replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"'); }
};

declare global { interface Window {} }

export default function App() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<"owner" | "admin" | "member">("member");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const inviteHandledRef = useRef(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalDueDate, setGoalDueDate] = useState("");
  const [page, setPage] = useState("Dashboard");
  const [selectedEmployee, setSelectedEmployee] = useState("maya");
  const [selectedChat, setSelectedChat] = useState("");
  const [showChatDetails, setShowChatDetails] = useState(false);
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobPriority, setJobPriority] = useState<"Normal" | "Urgent">("Normal");
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("All statuses");
  const [reviewNote, setReviewNote] = useState("");
  const [jobEmployee, setJobEmployee] = useState("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [newDepartmentParent, setNewDepartmentParent] = useState("__root__");
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showChatForm, setShowChatForm] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [newEmployeeDept, setNewEmployeeDept] = useState("");
  const [newEmployeeManager, setNewEmployeeManager] = useState("");
  const autoRunJobLockRef = useRef(false);
  const teamPulseLockRef = useRef(false);
  const lastTeamPulseRef = useRef("");
  const teamChainRef = useRef(0);
  const collaborationRoomRef = useRef<Promise<Conversation | null> | null>(null);
  const [newChatName, setNewChatName] = useState("");
  const [newChatMembers, setNewChatMembers] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveChatDrafts, setLiveChatDrafts] = useState<Record<string, string>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeSettings, setActiveSettings] = useState("General");
  const [openRouterKey, setOpenRouterKey] = useState(() => window.localStorage.getItem(openRouterKeyName) ?? "");
  const [freeModels, setFreeModels] = useState(fallbackFreeModels);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setModelsLoading(true);
    fetch("https://openrouter.ai/api/v1/models?filter=free").then((response) => { if (!response.ok) throw new Error("Could not load free models"); return response.json(); }).then((payload: { data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }> }) => {
      const models = (payload.data ?? []).filter((model) => model.id && model.id.endsWith(":free") && Number(model.pricing?.prompt ?? 1) === 0 && Number(model.pricing?.completion ?? 1) === 0).map((model) => ({ id: model.id!, name: (model.name || model.id!) + " (free)" })).sort((a, b) => a.name.localeCompare(b.name));
      if (active && models.length) setFreeModels(models);
    }).catch(() => { /* Keep only free fallback models if catalogue is unavailable. */ }).finally(() => { if (active) setModelsLoading(false); });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
      setAuthLoading(false);
    }).catch((error: unknown) => { if (active) { setAuthError(error instanceof Error ? error.message : "Could not initialise sign-in"); setAuthLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      if (!session?.user) { setCompany(null); setCompanies([]); setLoadedCompanyId(null); inviteHandledRef.current = false; }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!user || demoMode) return;
    let active = true;
    setLoadingCompanies(true);
    supabase.from("companies").select("id,name,industry,created_by,created_at").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) { notify("Could not load companies: " + error.message); setCompanies([]); }
      else setCompanies((data ?? []).map((row: any) => ({ id: row.id, name: row.name, industry: row.industry || "Company workspace", initials: initials(row.name), color: "blue", description: "Shared cloud workspace" })));
      setLoadingCompanies(false);
    });
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    const companyId = company.id;
    void supabase.from("departments").upsert(depts.map((d) => ({ id: d.id, company_id: companyId, name: d.name, parent_id: d.parentId ?? null })), { onConflict: "id" }).then(({ error }) => { if (error && depts.length) notify("Department save failed: " + error.message); });
  }, [depts, loadedCompanyId, company?.id, user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    const companyId = company.id;
    void supabase.from("employees").upsert(employees.map((e) => ({ id: e.id, company_id: companyId, department_id: e.deptId || null, manager_id: e.managerId ?? null, name: e.name, role: e.role, tone: e.tone, model: e.model, custom_instructions: e.instructions, status: e.status === "Needs review" ? "needs_review" : e.status.toLowerCase(), current_task: e.task ?? null, updated_at: new Date().toISOString() })), { onConflict: "id" }).then(({ error }) => { if (error && employees.length) notify("Employee save failed: " + error.message); });
  }, [employees, loadedCompanyId, company?.id, user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    const companyId = company.id;
    void supabase.from("jobs").upsert(jobs.map((j) => ({ id: j.id, company_id: companyId, employee_id: j.employeeId || null, title: j.title, description: j.description ?? "", status: j.status.toLowerCase().replace(" ", "_"), priority: j.priority.toLowerCase(), result: j.result ?? "", created_by: j.createdBy ?? user.id, reviewed_by: j.reviewedBy ?? (j.status === "Approved" ? user.id : null), created_at: j.created && !Number.isNaN(Date.parse(j.created)) ? new Date(j.created).toISOString() : new Date().toISOString(), submitted_at: j.submittedAt ? (Number.isNaN(Date.parse(j.submittedAt)) ? new Date().toISOString() : new Date(j.submittedAt).toISOString()) : null, updated_at: new Date().toISOString() })), { onConflict: "id" }).then(({ error }) => { if (error && jobs.length) notify("Job save failed: " + error.message); });
  }, [jobs, loadedCompanyId, company?.id, user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    const companyId = company.id;
    const rows = conversations.flatMap((c) => c.messages.filter((m) => m.from !== "teammate" && m.from !== "system").map((m) => ({
      id: m.id, company_id: companyId, conversation_id: c.id,
      sender_user_id: m.from === "you" ? user.id : m.senderUserId ?? null,
      sender_employee_id: m.from === "you" || m.senderUserId ? null : m.from,
      body: m.text, job_id: m.jobId ?? null, created_at: m.createdAt ?? new Date().toISOString()
    })));
    if (rows.length) void supabase.from("messages").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).then(({ error }) => { if (error) notify("Message save failed: " + error.message); });
  }, [conversations, loadedCompanyId, company?.id, user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    void supabase.from("workspace_settings").upsert({ company_id: company.id, approval_required: settings.approvalRequired, auto_run: settings.autoRun, daily_usage_limit: settings.dailyLimit, monthly_usage_limit: settings.monthlyLimit, enabled_connectors: settings.connectors.map((c) => (({ "OpenRouter": "openrouter" } as Record<string, string>)[c] ?? c.toLowerCase().replaceAll(" ", "_"))) }, { onConflict: "company_id" }).then(({ error }) => { if (error) notify("Settings save failed: " + error.message); });
  }, [settings, loadedCompanyId, company?.id, user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    void supabase.from("goals").upsert(goals.map((g) => ({ id: g.id, company_id: company.id, title: g.title, description: g.description, progress: g.progress, due_date: g.dueDate || null, status: g.status, created_by: g.createdBy ?? user.id, updated_at: new Date().toISOString() })), { onConflict: "id" }).then(({ error }) => { if (error && goals.length) notify("Goal save failed: " + error.message); });
  }, [goals, loadedCompanyId, company?.id, user?.id]);
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id) return;
    void supabase.from("companies").update({ name: company.name, industry: company.industry, updated_at: new Date().toISOString() }).eq("id", company.id).then(({ error }) => { if (error) notify("Company settings save failed: " + error.message); });
  }, [company?.name, company?.industry, loadedCompanyId, user?.id]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (selectedJobId) { const selected = jobs.find((job) => job.id === selectedJobId); setReviewNote(selected?.reviewNote ?? ""); } }, [selectedJobId]);

  const activeEmployee = employees.find((e) => e.id === selectedEmployee) ?? employees[0];
  const activeConversation = conversations.find((c) => c.id === selectedChat) ?? conversations[0];
  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const pendingJobs = jobs.filter((j) => j.status === "Queued" || j.status === "Submitted" || j.status === "Rejected");
  const filteredJobs = jobs.filter((j) => (j.title + " " + (j.description ?? "") + " " + (employeeMap.get(j.employeeId)?.name ?? "")).toLowerCase().includes(jobSearch.toLowerCase()) && (jobStatusFilter === "All statuses" || j.status === jobStatusFilter));
  const nav = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Management", icon: Users },
    { label: "Communication", icon: MessageCircle, count: conversations.length },
    { label: "Jobs & approvals", icon: Inbox, count: pendingJobs.length },
    { label: "Settings", icon: Settings2 }
  ];

  const notify = (text: string) => setToast(text);
  const startInteractiveDemo = () => {
    setDemoMode(true);
    setUser({ id: "demo-user", email: "demo@autobusiness.local" });
    setCompanies([{ ...demoCompany }]); setCompany({ ...demoCompany }); setLoadedCompanyId(demoCompany.id);
    setDepts(seedDepts.map((department) => ({ ...department })));
    setEmployees(seedEmployees.map((employee) => ({ ...employee })));
    setJobs(makeDemoJobs()); setConversations(makeDemoConversations()); setGoals(makeDemoGoals());
    setSettings({ ...defaultSettings }); setMemberRole("owner");
    setSelectedEmployee("maya"); setJobEmployee("maya"); setNewEmployeeDept("leadership"); setNewEmployeeManager(""); setSelectedChat("demo-group");
    setPage("Dashboard"); setMobileContextOpen(false); setAuthError(""); setAuthNotice(""); setToast(""); setSelectedJobId(null);
    setShowJobForm(false); setShowEmployeeForm(false); setShowCompanyForm(false); setShowChatForm(false); setShowGoalForm(false); setShowInviteForm(false);
  };
  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(""); setAuthNotice("");
    if (!authEmail.trim() || authPassword.length < 8) { setAuthError("Enter a valid email and a password with at least 8 characters."); return; }
    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL + window.location.search } });
        if (error) throw error;
        if (!data.session) setAuthNotice("Account created. Check your email to confirm your address, then sign in.");
        else setAuthNotice("Account created successfully.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally { setAuthBusy(false); }
  };
  const signOut = async () => {
    if (demoMode) {
      setDemoMode(false); setCompany(null); setCompanies([]); setLoadedCompanyId(null); setUser(null);
      setDepts([]); setEmployees([]); setJobs([]); setConversations([]); setGoals([]); setSettings(defaultSettings);
      setSelectedChat(""); setSelectedEmployee("maya"); setPage("Dashboard"); setMobileContextOpen(false); setToast("");
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) notify("Could not sign out: " + error.message);
    else { setCompany(null); setLoadedCompanyId(null); setCompanies([]); setUser(null); }
  };
  const openCompany = async (item: Company) => {
    if (demoMode) {
      setCompany(item); setLoadingWorkspace(false); setPage("Dashboard"); setLoadedCompanyId(item.id);
      setDepts(seedDepts.map((department) => ({ ...department })));
      setEmployees(seedEmployees.map((employee) => ({ ...employee })));
      setJobs(makeDemoJobs()); setConversations(makeDemoConversations()); setGoals(makeDemoGoals());
      setSettings({ ...defaultSettings }); setMemberRole("owner");
      setSelectedEmployee("maya"); setJobEmployee("maya"); setNewEmployeeDept("leadership"); setSelectedChat("demo-group");
      return;
    }
    setCompany(item);
    setLoadedCompanyId(null);
    setLoadingWorkspace(true);
    setPage("Dashboard");
    try {
      const [deptRes, employeeRes, jobRes, convRes, messageRes, memberRes, settingsRes, goalRes, roleRes] = await Promise.all([
        supabase.from("departments").select("*").eq("company_id", item.id).order("created_at"),
        supabase.from("employees").select("*").eq("company_id", item.id).order("created_at"),
        supabase.from("jobs").select("*").eq("company_id", item.id).order("created_at", { ascending: false }),
        supabase.from("conversations").select("*").eq("company_id", item.id).order("created_at"),
        supabase.from("messages").select("*").eq("company_id", item.id).order("created_at"),
        supabase.from("conversation_members").select("*").eq("company_id", item.id),
        supabase.from("workspace_settings").select("*").eq("company_id", item.id).maybeSingle(),
        supabase.from("goals").select("*").eq("company_id", item.id).order("created_at", { ascending: false }),
        supabase.from("company_members").select("role").eq("company_id", item.id).eq("user_id", user?.id ?? "").maybeSingle()
      ]);
      const error = [deptRes, employeeRes, jobRes, convRes, messageRes, memberRes, settingsRes, goalRes, roleRes].find((result) => result.error)?.error;
      if (error) throw error;
      const departmentRows = deptRes.data ?? [];
      const employeeRows = employeeRes.data ?? [];
      const conversationRows = convRes.data ?? [];
      const messageRows = messageRes.data ?? [];
      const memberRows = memberRes.data ?? [];
      const nextEmployees: Employee[] = employeeRows.map((row: any) => ({
        id: row.id, name: row.name, role: row.role, deptId: row.department_id ?? "", managerId: row.manager_id ?? undefined, tone: row.tone,
        model: row.model, instructions: row.custom_instructions, status: row.status === "needs_review" ? "Needs review" : row.status === "working" ? "Working" : row.status === "paused" ? "Paused" : "Available",
        task: row.current_task ?? undefined
      }));
      setDepts(departmentRows.map((row: any) => ({ id: row.id, name: row.name, parentId: row.parent_id ?? undefined })));
      setEmployees(nextEmployees);
      setJobs((jobRes.data ?? []).map((row: any) => ({
        id: row.id, title: row.title, description: row.description, employeeId: row.employee_id ?? "",
        status: row.status === "in_progress" ? "In progress" : row.status === "submitted" ? "Submitted" : row.status === "approved" ? "Approved" : row.status === "rejected" ? "Rejected" : "Queued",
        priority: row.priority === "urgent" || row.priority === "high" ? "Urgent" : "Normal",
        created: new Date(row.created_at).toLocaleString(), result: row.result || undefined,
        submittedAt: row.submitted_at ?? undefined,
        createdBy: row.created_by, reviewedBy: row.reviewed_by ?? undefined
      })));
      setConversations(conversationRows.map((row: any) => ({
        id: row.id, name: row.name, kind: row.kind,
        createdBy: row.created_by,
        members: memberRows.filter((member: any) => member.conversation_id === row.id && member.employee_id).map((member: any) => member.employee_id),
        messages: messageRows.filter((message: any) => message.conversation_id === row.id).map((message: any) => ({
          id: message.id, from: message.sender_user_id ? (message.sender_user_id === user?.id ? "you" : "teammate") : message.sender_employee_id ?? "system",
          senderUserId: message.sender_user_id ?? undefined, text: message.body, time: new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          createdAt: message.created_at, jobId: message.job_id ?? undefined
        }))
      })));
      const dbSettings = settingsRes.data;
      setSettings(dbSettings ? {
        approvalRequired: dbSettings.approval_required, autoRun: dbSettings.auto_run,
        dailyLimit: dbSettings.daily_usage_limit, monthlyLimit: dbSettings.monthly_usage_limit,
        connectors: Array.from(new Set([...(dbSettings.enabled_connectors ?? ["openrouter"]).map((name: string) => (({ openrouter: "OpenRouter", supabase: "Supabase" } as Record<string, string>)[name] ?? name)), "Supabase"]))
      } : defaultSettings);
      setGoals((goalRes.data ?? []).map((row: any) => ({ id: row.id, title: row.title, description: row.description, progress: Number(row.progress), dueDate: row.due_date ?? undefined, status: row.status, createdBy: row.created_by })));
      setMemberRole(roleRes.data?.role ?? "member");
      setSelectedEmployee(nextEmployees[0]?.id ?? "");
      setJobEmployee(nextEmployees[0]?.id ?? "");
      setNewEmployeeDept(departmentRows[0]?.id ?? ""); setNewEmployeeManager("");
      setSelectedChat(conversationRows[0]?.id ?? "");
      setLoadedCompanyId(item.id);
    } catch (error) {
      notify("Could not load this workspace: " + (error instanceof Error ? error.message : "Unknown database error"));
      setCompany(null);
      setLoadedCompanyId(null);
    } finally {
      setLoadingWorkspace(false);
    }
  };
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (demoMode || !user || !token || inviteHandledRef.current) return;
    inviteHandledRef.current = true;
    const accept = async () => {
      try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        const tokenHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const { data: companyId, error } = await supabase.rpc("accept_company_invite", { p_token_hash: tokenHash });
        if (error) throw error;
        window.history.replaceState({}, document.title, window.location.pathname);
        const { data: row, error: companyError } = await supabase.from("companies").select("id,name,industry").eq("id", companyId).single();
        if (companyError) throw companyError;
        const invitedCompany: Company = { id: row.id, name: row.name, industry: row.industry || "Company workspace", initials: initials(row.name), color: "blue", description: "Shared cloud workspace" };
        setCompanies((old) => old.some((item) => item.id === invitedCompany.id) ? old : [invitedCompany, ...old]);
        notify("Invitation accepted. Welcome to " + invitedCompany.name + ".");
        await openCompany(invitedCompany);
      } catch (error) {
        notify("Could not accept invitation: " + (error instanceof Error ? error.message : "Invalid or expired invite"));
      }
    };
    void accept();
  }, [user?.id]);
  const changePage = (next: string) => {
    setPage(next);
    setMobileContextOpen(true);
    if (next === "Communication") setSelectedChat(conversations.find((c) => c.kind === "group")?.id ?? conversations[0]?.id ?? "");
  };
  const createJob = (event: FormEvent) => {
    event.preventDefault();
    if (!jobTitle.trim() || !company || !user || !jobEmployee) { notify("Create an employee before assigning a job"); return; }
    const now = new Date();
    const countInPeriod = (job: Job, period: "day" | "month") => {
      const parsed = Date.parse(job.created);
      const date = new Date(Number.isNaN(parsed) ? Date.now() : parsed);
      return period === "day" ? date.toDateString() === now.toDateString() : date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    };
    if (jobs.filter((job) => countInPeriod(job, "day")).length >= settings.dailyLimit) { notify("Daily job creation limit reached. Increase the limit in Settings to assign more work."); return; }
    if (jobs.filter((job) => countInPeriod(job, "month")).length >= settings.monthlyLimit) { notify("Monthly job creation limit reached. Increase the limit in Settings to assign more work."); return; }
    const job: Job = { id: crypto.randomUUID(), title: jobTitle.trim(), description: jobDescription.trim(), employeeId: jobEmployee, status: settings.approvalRequired ? "Queued" : "In progress", priority: jobPriority, created: new Date().toISOString(), createdBy: user.id };
    setJobs((old) => [job, ...old]);
    setEmployees((old) => old.map((e) => e.id === jobEmployee ? { ...e, status: job.status === "Queued" ? "Available" : "Working", task: job.title } : e));
    setJobTitle(""); setJobDescription(""); setJobPriority("Normal"); setShowJobForm(false); notify(settings.approvalRequired ? "Job queued for approval" : "Job assigned");
  };
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || !activeConversation) return;
    const text = message.trim();
    setMessage("");
    const sent: Message = { id: crypto.randomUUID(), from: "you", text, time: nowTime(), createdAt: new Date().toISOString() };
    lastTeamPulseRef.current = "message:" + sent.id;
    teamChainRef.current = 0;
    setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, sent] } : c));

    if (demoMode) {
      const responder = (activeConversation.kind === "group"
        ? activeConversation.members.map((id) => employeeMap.get(id)).find((employee) => employee && employee.status !== "Paused")
        : employeeMap.get(activeConversation.members[0])) ?? employees.find((employee) => employee.status !== "Paused");
      if (!responder) { notify("No available demo employees are members of this conversation."); return; }
      const asksForWork = /\b(plan|draft|write|research|prepare|analyse|analyze|report|build|create|design|audit|summari[sz]e|launch|compare)\b/i.test(text);
      if (asksForWork) {
        const title = text.length > 84 ? text.slice(0, 81).trimEnd() + "…" : text;
        const job: Job = {
          id: crypto.randomUUID(), title, description: text, employeeId: responder.id, status: "Submitted",
          priority: "Normal", created: new Date().toISOString(), submittedAt: new Date().toISOString(),
          createdBy: user?.id,
          result: "# Demo deliverable\n\nThis is a simulated deliverable created to demonstrate the review workflow. No external AI service was called.\n\n## Request\n" + text + "\n\n## Suggested next steps\nReview the result, add revision feedback if needed, or approve it to complete the workflow."
        };
        setJobs((old) => [job, ...old]);
        setEmployees((old) => old.map((employee) => employee.id === responder.id ? { ...employee, status: "Needs review", task: title } : employee));
        const response: Message = { id: crypto.randomUUID(), from: responder.id, text: "[Demo] I’ve prepared a sample deliverable for “" + title + "”. It is ready for your review.", time: nowTime(), createdAt: new Date().toISOString(), jobId: job.id };
        setConversations((old) => old.map((conversation) => conversation.id === activeConversation.id ? { ...conversation, messages: [...conversation.messages, response] } : conversation));
        setSelectedJobId(job.id); setPage("Jobs & approvals"); setMobileContextOpen(false);
        notify("Demo deliverable ready for review");
      } else {
        const response: Message = { id: crypto.randomUUID(), from: responder.id, text: "[Demo reply] I’ve taken the earlier conversation and sample assignments into account. In a live workspace, this response would come from the configured AI provider.", time: nowTime(), createdAt: new Date().toISOString() };
        setConversations((old) => old.map((conversation) => conversation.id === activeConversation.id ? { ...conversation, messages: [...conversation.messages, response] } : conversation));
      }
      return;
    }

    if (!settings.connectors.includes("OpenRouter")) { notify("Message saved. Enable OpenRouter in Settings to receive AI replies."); return; }
    if (!openRouterKey.trim()) { notify("Add your OpenRouter API key in Settings → Connectors first."); setPage("Settings"); setActiveSettings("Connectors"); return; }

    setBusy(true);
    try {

      const dialogue = activeConversation.messages.map((m) => {
        const speaker = m.from === "you" ? "User" : m.from === "system" ? "System" : employeeMap.get(m.from)?.name ?? "Team member";
        return speaker + ": " + m.text;
      }).join("\\n\\n");
      // Shared employee memory spans every private/group chat and completed or active assignment.
      // Only send workspace-local context relevant to this employee; never include other companies.
      const workspaceMemoryFor = (emp: Employee) => {
        const chatHistory = conversations.flatMap((conversation) => {
          if (!conversation.members.includes(emp.id)) return [];
          const lines = conversation.messages.map((m) => {
            const speaker = m.from === "you" ? "User" : m.from === "system" ? "System" : employeeMap.get(m.from)?.name ?? "Team member";
            return speaker + ": " + m.text;
          });
          return lines.length ? ["CHAT " + conversation.name + " (" + conversation.kind + "):\\n" + lines.join("\\n")] : [];
        }).join("\\n\\n");
        const assignmentHistory = jobs.filter((job) => job.employeeId === emp.id).map((job) =>
          "ASSIGNMENT [" + job.status + "]: " + job.title + "\\nBrief: " + (job.description || "None") +
          "\\nResult: " + (job.result || "Not submitted") + (job.reviewNote ? "\\nReview feedback: " + job.reviewNote : "")
        ).join("\\n\\n");
        return "EMPLOYEE MEMORY — ALL RELEVANT CHATS AND ASSIGNMENTS\\n" + (chatHistory || "No earlier chats.") +
          "\\n\\nPAST AND CURRENT ASSIGNMENTS\\n" + (assignmentHistory || "No earlier assignments.") +
          "\\n\\nUse this as persistent working context. Remember decisions, preferences, commitments, previous results, and feedback; do not claim to remember anything outside this supplied history.";
      };
      const groupMembers = activeConversation.members.map((id) => employeeMap.get(id)).filter((emp): emp is Employee => Boolean(emp) && emp?.status !== "Paused");
      // Start with one colleague; each reply becomes an event for the next colleague to consider.
      const targets = activeConversation.kind === "group"
        ? groupMembers.slice(0, 1)
        : activeConversation.members.length === 1
          ? [employeeMap.get(activeConversation.members[0])].filter((emp): emp is Employee => Boolean(emp))
          : [];

      if (!targets.length) {
        notify("No available AI employees are members of this conversation.");
        return;
      }

      // Every member receives the same full dialogue and the latest request. Each decides
      // independently whether they have a useful contribution to make to the group.
      const replies = await Promise.all(targets.map(async (emp) => {
        try {
          const model = freeModels.some((item) => item.id === emp.model) ? emp.model : freeModels[0]?.id ?? fallbackFreeModels[0].id;
          const groupInstruction = activeConversation.kind === "group"
            ? "This is a group chat. Independently decide whether to reply, start a substantial assignment for yourself, or stay silent. Avoid acknowledgement-only replies and do not impersonate coworkers."
            : "This is a private chat. Decide whether to reply conversationally or open an assignment for yourself if the user has requested meaningful work.";
          const prompt = [
            { role: "system", content: "You are " + emp.name + ", " + emp.role + " in the " + company?.name + " workspace. Tone: " + emp.tone + ". Custom instructions: " + (emp.instructions || "Be accurate and useful.") + ". Current task: " + (emp.task || "none") + ".\\n" + groupInstruction + "\\nRespond in natural Markdown or plain text, never JSON. If you decide to take ownership of a substantial task, begin with [[START_JOB: concise title]] on its own line, then continue with a brief acknowledgement. If you have no useful contribution, return exactly [[NO_REPLY]]. Otherwise reply naturally. Decide independently; silence is acceptable. Never claim work is completed before producing it." },
            { role: "user", content: workspaceMemoryFor(emp) + "\\n\\nCURRENT CONVERSATION (" + activeConversation.name + "):\\n" + (dialogue || "(No previous messages.)") + "\\n\\nLATEST REQUEST: " + text + "\\n\\nUse all supplied memory consistently. Do not create duplicate assignments for work already completed or in progress unless the user clearly requests a new one." }
          ];
          const draftKey = activeConversation.id + ":" + emp.id;
          let rawStream = "";
          setLiveChatDrafts((old) => ({ ...old, [draftKey]: "" }));
          const raw = await requestOpenRouter(model, prompt, openRouterKey, (chunk) => {
            rawStream += chunk;
            const trimmed = rawStream.trimStart();
            const markerEnd = trimmed.startsWith("[[START_JOB") ? trimmed.indexOf("]]") : -1;
            const visible = markerEnd >= 0 ? trimmed.slice(markerEnd + 2).trimStart() : trimmed.startsWith("[[NO_REPLY]]") ? "" : trimmed;
            if (visible) setLiveChatDrafts((old) => ({ ...old, [draftKey]: visible }));
          });
          const trimmedRaw = raw.trimStart();
          const markerEnd = trimmedRaw.startsWith("[[START_JOB") ? trimmedRaw.indexOf("]]") : -1;
          const marker = markerEnd >= 0 ? trimmedRaw.slice(0, markerEnd + 2) : "";
          const jobTitle = marker.startsWith("[[START_JOB:") ? marker.slice(12, -2).trim() : "";
          const answerText = markerEnd >= 0 ? trimmedRaw.slice(markerEnd + 2).trim() : trimmedRaw;
          const decision: { action?: string; reply?: string; title?: string; description?: string } = {
            action: markerEnd >= 0 ? "start_job" : trimmedRaw === "[[NO_REPLY]]" ? "ignore" : "reply",
            reply: answerText,
            title: jobTitle,
            description: text
          };
          if (decision.action === "start_job") {
            const title = (decision.title || text).trim().slice(0, 240);
            const job: Job = { id: crypto.randomUUID(), title: title || "Employee task", description: (decision.description || text).trim(), employeeId: emp.id, status: "In progress", priority: "Normal", created: new Date().toISOString(), createdBy: user?.id };
            setJobs((old) => [job, ...old]);
            setEmployees((old) => old.map((employee) => employee.id === emp.id ? { ...employee, status: "Working", task: job.title } : employee));
            const workPrompt = [
              { role: "system", content: "You are " + emp.name + ", " + emp.role + ". Complete the assignment and produce the actual deliverable. Follow your instructions: " + (emp.instructions || "Be accurate and useful.") + ". Do not claim external actions or access you do not have. If blocked, clearly report the blocker and what is needed." },
              { role: "user", content: workspaceMemoryFor(emp) + "\\n\\nASSIGNMENT: " + job.title + "\\nBRIEF: " + job.description + "\\n\nCURRENT CHAT CONTEXT:\\n" + dialogue + "\\n\\nUSER'S LATEST REQUEST: " + text + "\\n\\nProduce the deliverable now, not a plan." }
            ];
            const deliverable = (await requestOpenRouter(model, workPrompt, openRouterKey, (chunk) => {
              setJobs((old) => old.map((item) => item.id === job.id ? { ...item, result: (item.result || "") + chunk } : item));
            })).trim();
            if (!deliverable) throw new Error("The assignment was opened, but the AI returned an empty deliverable.");
            setJobs((old) => old.map((item) => item.id === job.id ? { ...item, status: "Submitted", result: deliverable, submittedAt: new Date().toISOString() } : item));
            setEmployees((old) => old.map((employee) => employee.id === emp.id ? { ...employee, status: "Needs review", task: job.title } : employee));
            return { emp, answer: "I’ve opened an assignment for myself: " + job.title + "\\n\\nI’ve completed a first deliverable and submitted it for review. You can inspect it in Jobs & approvals.", error: "", jobId: job.id };
          }
          if (decision.action === "ignore") return { emp, answer: "[[NO_REPLY]]", error: "" };
          return { emp, answer: (decision.reply || raw).trim(), error: "", jobId: undefined };
        } catch (error) {
          return { emp, answer: "", error: describeError(error, "Unknown OpenRouter error"), jobId: undefined };
        }
      }));

      setLiveChatDrafts({});
      const responses: Message[] = replies
        .filter(({ answer }) => answer && answer !== "[[NO_REPLY]]")
        .map(({ emp, answer, jobId }) => ({ id: crypto.randomUUID(), from: emp.id, text: answer, time: nowTime(), createdAt: new Date().toISOString(), jobId }));

      if (responses.length) {
        setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, ...responses] } : c));
      } else if (activeConversation.kind === "group" && !replies.some(({ error }) => error)) {
        setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, { id: crypto.randomUUID(), from: "system", text: "The team reviewed the message; nobody had a useful contribution to add yet.", time: nowTime(), createdAt: new Date().toISOString() }] } : c));
      }
      const failures = replies.filter(({ error }) => error);
      if (failures.length) {
        const summary = failures.map(({ emp, error }) => emp.name + ": " + error).join(" | ");
        notify("Some AI replies failed: " + summary);
      }
      if (activeConversation.kind === "private" && !responses.length && !failures.length) {
        throw new Error("OpenRouter returned an empty reply. Check the selected model and your OpenRouter account.");
      }
    } catch (error) {
      const reason = describeError(error, "Unknown OpenRouter error");
      const detail = /popup_blocked/i.test(reason)
        ? "OpenRouter sign-in popup was blocked. Allow pop-ups for this site, then send your message again."
        : /auth_window_closed/i.test(reason)
          ? "OpenRouter sign-in was cancelled. Sign in to OpenRouter to receive AI replies."
          : "OpenRouter request failed: " + reason;
      setConversations((old) => old.map((c) => c.id === activeConversation.id ? { ...c, messages: [...c.messages, { id: crypto.randomUUID(), from: "system", text: detail + " Your original message is saved.", time: nowTime(), createdAt: new Date().toISOString() }] } : c));
    } finally {
      setLiveChatDrafts({});
      setBusy(false);
    }
  };
  const ensureCollaborationRoom = async (): Promise<Conversation | null> => {
    const existing = conversations.find((conversation) => conversation.name === "Team collaboration" && conversation.kind === "group");
    if (existing) {
      const missingMembers = employees.filter((employee) => employee.status !== "Paused" && !existing.members.includes(employee.id));
      if (missingMembers.length) {
        if (!demoMode && company) {
          const rows = missingMembers.map((employee) => ({ company_id: company.id, conversation_id: existing.id, user_id: null, employee_id: employee.id }));
          const { error } = await supabase.from("conversation_members").insert(rows);
          if (error) throw error;
        }
        const updated = { ...existing, members: [...existing.members, ...missingMembers.map((employee) => employee.id)] };
        setConversations((old) => old.map((conversation) => conversation.id === existing.id ? updated : conversation));
        return updated;
      }
      return existing;
    }
    if (collaborationRoomRef.current) return collaborationRoomRef.current;
    const pending = (async () => {
      if (!company || !user) return null;
      const id = crypto.randomUUID();
      const members = employees.filter((employee) => employee.status !== "Paused").map((employee) => employee.id);
      const room: Conversation = { id, name: "Team collaboration", kind: "group", members, messages: [], createdBy: user.id };
      if (!demoMode) {
        const { error } = await supabase.from("conversations").insert({ id, company_id: company.id, name: room.name, kind: "group", created_by: user.id });
        if (error) throw error;
        const rows = [{ company_id: company.id, conversation_id: id, user_id: user.id, employee_id: null }, ...members.map((employeeId) => ({ company_id: company.id, conversation_id: id, user_id: null, employee_id: employeeId }))];
        const { error: membershipError } = await supabase.from("conversation_members").insert(rows);
        if (membershipError) throw membershipError;
      }
      setConversations((old) => old.some((conversation) => conversation.name === room.name && conversation.kind === "group") ? old : [room, ...old]);
      return room;
    })();
    collaborationRoomRef.current = pending;
    try { return await pending; }
    finally { collaborationRoomRef.current = null; }
  };
  const appendAgentMessages = (room: Conversation, messages: Message[]) => {
    if (!messages.length) return;
    setConversations((old) => {
      const exists = old.some((conversation) => conversation.id === room.id);
      if (!exists) return [{ ...room, messages: [...room.messages, ...messages] }, ...old];
      return old.map((conversation) => conversation.id === room.id ? { ...conversation, messages: [...conversation.messages, ...messages] } : conversation);
    });
  };
  const runJob = async (jobId: string, feedbackOverride?: string, options: { background?: boolean } = {}) => {
    const background = Boolean(options.background);
    if (demoMode) {
      const job = jobs.find((item) => item.id === jobId);
      if (!job || busy) return;
      const output = "# Demo deliverable: " + job.title + "\n\nThis is simulated output for the interactive demo. No external AI service was called.\n\n## Brief\n" + (job.description || "No additional brief supplied.") + "\n\n## Proposed result\n\n1. Confirm the intended outcome and audience.\n2. Prepare a first version that meets the brief.\n3. Review assumptions and revise before approving.\n\n## Review checklist\n\n- Does the result meet the brief?\n- Are assumptions and limitations explicit?\n- What would improve the next iteration?";
      setJobs((old) => old.map((item) => item.id === jobId ? { ...item, status: "Submitted", result: output, submittedAt: new Date().toISOString() } : item));
      setEmployees((old) => old.map((employee) => employee.id === job.employeeId ? { ...employee, status: "Needs review", task: job.title } : employee));
      setSelectedJobId(jobId); notify("Demo deliverable created — review the work");
      return;
    }
    if (!settings.connectors.includes("OpenRouter")) { if (!background) notify("Enable OpenRouter in Settings before running AI jobs"); return; }
    if (!openRouterKey.trim()) { if (!background) { notify("Add your OpenRouter API key in Settings → Connectors first."); setPage("Settings"); setActiveSettings("Connectors"); } return; }
    if (!background && autoRunJobLockRef.current) { notify("A background agent is already working on a job."); return; }
    if (!background && busy) return;
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    const emp = employeeMap.get(job.employeeId);
    if (!emp) { if (!background) notify("This job has no assigned employee"); return; }
    if (!background) setBusy(true);
    try {
      const modelFor = (employee: Employee) => freeModels.some((item) => item.id === employee.model) ? employee.model : freeModels[0]?.id ?? fallbackFreeModels[0].id;
      const department = departmentPath(emp.deptId);
      const manager = emp.managerId ? employeeMap.get(emp.managerId) : undefined;
      const room = await ensureCollaborationRoom();
      const addWorkNote = (employeeId: string, text: string) => {
        if (room) appendAgentMessages(room, [{ id: crypto.randomUUID(), from: employeeId, text, time: nowTime(), createdAt: new Date().toISOString(), jobId }]);
      };
      const streamEmployeeOutput = async (employee: Employee, messages: Array<{ role: string; content: string }>, showInJob: boolean = false) => {
        const draftKey = room ? room.id + ":" + employee.id : "";
        let streamed = "";
        if (draftKey) setLiveChatDrafts((old) => ({ ...old, [draftKey]: "" }));
        try {
          return (await requestOpenRouter(modelFor(employee), messages, openRouterKey, (chunk) => {
            streamed += chunk;
            if (draftKey) setLiveChatDrafts((old) => ({ ...old, [draftKey]: streamed }));
            if (showInJob) setJobs((old) => old.map((item) => item.id === jobId ? { ...item, result: streamed } : item));
          })).trim();
        } finally {
          if (draftKey) setLiveChatDrafts((old) => {
            const next = { ...old };
            delete next[draftKey];
            return next;
          });
        }
      };
      setJobs((old) => old.map((item) => item.id === jobId ? { ...item, result: "" } : item));
      addWorkNote(emp.id, "Starting “" + job.title + "”. I’m breaking the brief into a deliverable, checking the acceptance criteria, and coordinating a supporting contribution before review.");
      const colleagues = employees.filter((candidate) => candidate.id !== emp.id && candidate.status !== "Paused");
      const contributor = colleagues.find((candidate) => candidate.id !== manager?.id && candidate.deptId === emp.deptId)
        ?? colleagues.find((candidate) => candidate.id !== manager?.id)
        ?? colleagues[0];
      const reviewer = (manager && manager.id !== contributor?.id && manager.status !== "Paused" ? manager : undefined)
        ?? colleagues.find((candidate) => candidate.id !== contributor?.id && candidate.status !== "Paused")
        ?? (contributor?.id !== emp.id ? contributor : undefined);
      const prompt = "You are " + emp.name + ", " + emp.role + " in " + department + " at " + company?.name + ". Your manager is " + (manager?.name ?? "the company owner") + ". Tone: " + emp.tone + ". Instructions: " + (emp.instructions || "Produce accurate, useful work and state assumptions.") + ".\n\nJOB: " + job.title + "\n\nDETAILS / ACCEPTANCE CRITERIA: " + (job.description || "No extra details supplied. Infer a sensible scope and state assumptions.") + "\n\nPREVIOUS REVIEW FEEDBACK: " + (feedbackOverride ?? job.reviewNote ?? "None.") + "\n\nProduce the actual deliverable, not a plan to do it. Use clear headings and concrete content. Address review feedback. Do not claim to have accessed external systems, files, or company data unless supplied in the prompt. State limitations explicitly. Include a short ## Work note with a 2–3 sentence summary of your approach and decisions; do not expose private hidden chain-of-thought.";
      const draft = await streamEmployeeOutput(emp, [{ role: "user", content: prompt }], true);
      if (!draft) throw new Error("The AI provider returned an empty deliverable.");
      let output = draft;
      let reviewFeedback = "";
      if (contributor) {
        addWorkNote(emp.id, "I have a first draft. I’m asking " + contributor.name + " (" + contributor.role + ") to contribute a specialist section so the final result is one coordinated piece of work.");
        try {
          const contribution = await streamEmployeeOutput(contributor, [
            { role: "system", content: "You are " + contributor.name + ", " + contributor.role + " in " + departmentPath(contributor.deptId) + ". You are collaborating with " + emp.name + " on the SAME deliverable. Return a focused, useful contribution that can be incorporated into the shared document, not a separate deliverable. Explain assumptions briefly, avoid repeating the whole draft, and never invent company facts. Keep the contribution under 700 words." },
            { role: "user", content: "SHARED JOB: " + job.title + "\nBRIEF: " + (job.description || "No additional details supplied.") + "\n\nCURRENT DRAFT FROM " + emp.name + ":\n" + draft + "\n\nProvide the most valuable complementary section or improvements for this same deliverable." }
          ]);
          if (contribution) {
            addWorkNote(contributor.id, "I’ve reviewed " + emp.name + "’s draft and contributed the following material to the shared deliverable:\n\n" + contribution.slice(0, 1400));
            const integrated = await streamEmployeeOutput(emp, [
              { role: "system", content: "You are " + emp.name + ", the accountable owner of this shared deliverable. Integrate the specialist contribution into your existing draft. Remove duplication, resolve conflicts, preserve useful content and return one cohesive final document in Markdown. Do not claim external actions. State assumptions and limitations clearly." },
              { role: "user", content: "JOB: " + job.title + "\nBRIEF: " + (job.description || "No additional details supplied.") + "\n\nYOUR DRAFT:\n" + draft + "\n\nSPECIALIST CONTRIBUTION FROM " + contributor.name + " (" + contributor.role + "):\n" + contribution + "\n\nCreate one integrated deliverable, not two separate pieces." }
            ], true);
            if (integrated) output = integrated;
            addWorkNote(emp.id, "I’ve integrated " + contributor.name + "’s contribution into one document and removed duplicated points. I’m sending the combined version for review.");
          }
        } catch {
          addWorkNote(emp.id, "I couldn’t get a usable contribution from " + contributor.name + " this round, so I’m continuing with the draft and noting that peer input was unavailable.");
        }
      }
      if (reviewer) {
        try {
          reviewFeedback = await streamEmployeeOutput(reviewer, [
            { role: "system", content: "You are " + reviewer.name + ", " + reviewer.role + " and " + (manager?.id === reviewer.id ? "the manager" : "a collaborating colleague") + " of " + emp.name + ". Review the draft against the brief. Give concise, specific feedback: gaps, factual cautions, missing acceptance criteria and concrete improvements. Do not rewrite the entire deliverable and do not invent facts." },
            { role: "user", content: "JOB: " + job.title + "\nBRIEF: " + (job.description || "No additional details supplied.") + "\n\nDRAFT FROM " + emp.name + ":\n" + output + "\n\nProvide a useful peer review in under 250 words." }
          ]);
          if (reviewFeedback) {
            const revised = await streamEmployeeOutput(emp, [
              { role: "system", content: "You are " + emp.name + ", " + emp.role + ". Refine your deliverable using the peer review. Keep strong original material, address valid issues, and do not blindly accept unsupported feedback. Produce only the revised final deliverable." },
              { role: "user", content: "JOB: " + job.title + "\nBRIEF: " + (job.description || "No additional details supplied.") + "\n\nYOUR FIRST DRAFT:\n" + output + "\n\nREVIEW FROM " + reviewer.name + ":\n" + reviewFeedback + "\n\nPREVIOUS USER FEEDBACK: " + (feedbackOverride ?? job.reviewNote ?? "None") }
            ], true);
            if (revised) output = revised;
          }
        } catch (reviewError) {
          // A peer-review failure should not discard an otherwise usable deliverable.
          reviewFeedback = "";
          if (!background) notify("The deliverable was generated, but peer review was unavailable: " + describeError(reviewError, "Unknown review error"));
        }
      }
      const submittedAt = new Date().toISOString();
      setJobs((old) => old.map((item) => item.id === jobId ? { ...item, status: "Submitted", result: output, submittedAt } : item));
      setEmployees((old) => old.map((employee) => employee.id === emp.id ? { ...employee, status: "Needs review", task: job.title } : employee));
      if (reviewFeedback && reviewer) {
        addWorkNote(reviewer.id, "Reviewing the shared document against the brief. My checks are completeness, unsupported claims, and whether the acceptance criteria are met.\n\nReview notes for “" + job.title + "”:\n\n" + reviewFeedback.slice(0, 1800));
        addWorkNote(emp.id, "I’ve considered " + reviewer.name + "’s review, made a revision pass, and submitted the integrated document for your review.");
      } else {
        addWorkNote(emp.id, "The integrated deliverable is ready. I’ve recorded the collaboration steps; it is now awaiting your review.");
      }
      if (!background) { setSelectedJobId(jobId); notify("Deliverable created and submitted for review"); }
    } catch (error) {
      const reason = describeError(error, "Unknown OpenRouter error");
      if (!background) notify("AI job failed: " + reason);
      else {
        setJobs((old) => old.map((item) => item.id === jobId ? { ...item, status: "Queued" } : item));
        setEmployees((old) => old.map((employee) => employee.id === job.employeeId ? { ...employee, status: "Available" } : employee));
        notify("Background agent could not complete the job; it was returned to the queue: " + reason);
      }
    } finally { if (!background) setBusy(false); }
  };
  useEffect(() => {
    if (demoMode || !user || !company || loadedCompanyId !== company.id || !settings.autoRun || !openRouterKey.trim() || !settings.connectors.includes("OpenRouter")) return;
    if (busy || autoRunJobLockRef.current || teamPulseLockRef.current) return;

    const nextJob = jobs.filter((job) => job.status === "In progress").sort((a, b) =>
      (Date.parse(a.created) || 0) - (Date.parse(b.created) || 0)
    )[0];
    if (nextJob) {
      autoRunJobLockRef.current = true;
      void runJob(nextJob.id, undefined, { background: true }).finally(() => {
        autoRunJobLockRef.current = false;
        setJobs((old) => old.slice());
      });
      return;
    }

    const messageEvents = conversations.flatMap((conversation) => conversation.messages
      .filter((message) => message.from !== "system")
      .map((message) => ({
        key: "message:" + message.id,
        at: Date.parse(message.createdAt || "") || 0,
        kind: "message" as const,
        conversation,
        message
      })));
    const jobEvents = jobs.filter((job) => ["Queued", "In progress", "Submitted", "Rejected", "Approved"].includes(job.status))
      .map((job) => ({
        key: "job:" + job.id + ":" + job.status + ":" + (job.submittedAt || job.created),
        at: Date.parse(job.submittedAt || job.created) || 0,
        kind: "job" as const,
        job
      }));
    const latestEvent = [...messageEvents, ...jobEvents].sort((a, b) => b.at - a.at)[0];
    if (!latestEvent) return;

    // Treat existing workspace activity as history on the initial render.
    if (!lastTeamPulseRef.current) {
      lastTeamPulseRef.current = latestEvent.key;
      return;
    }
    if (latestEvent.key === lastTeamPulseRef.current) return;

    // A new message or job state change starts one decision. A useful reply becomes
    // the next event. Silence ends the chain; the ceiling prevents runaway loops.
    if (teamChainRef.current >= 8) {
      lastTeamPulseRef.current = latestEvent.key;
      teamChainRef.current = 0;
      return;
    }

    const activeEmployees = employees.filter((employee) => employee.status !== "Paused");
    if (!activeEmployees.length) return;

    let destination: Conversation | null = null;
    let actor: Employee | undefined;
    let eventDescription = "";

    if (latestEvent.kind === "message") {
      destination = latestEvent.conversation;
      const members = latestEvent.conversation.members
        .map((id) => employeeMap.get(id))
        .filter((employee): employee is Employee => Boolean(employee) && employee?.status !== "Paused");
      if (!members.length) return;
      const sourceIndex = members.findIndex((employee) => employee.id === latestEvent.message.from);
      if (latestEvent.message.from === "you") actor = members[0];
      else if (sourceIndex >= 0 && members.length > 1) actor = members[(sourceIndex + 1) % members.length];
      else actor = members.find((employee) => employee.id !== latestEvent.message.from);
      if (!actor) return;
      eventDescription = "A new message in " + latestEvent.conversation.name + " from " +
        (latestEvent.message.from === "you" ? "the company owner" : employeeMap.get(latestEvent.message.from)?.name || "a colleague") +
        ":\n" + latestEvent.message.text;
    } else {
      const job = latestEvent.job;
      destination = null;
      const owner = employeeMap.get(job.employeeId);
      if (job.status === "Rejected") actor = owner;
      else if (job.status === "Submitted" || job.status === "Approved") {
        actor = (owner?.managerId ? employeeMap.get(owner.managerId) : undefined)
          ?? activeEmployees.find((employee) => employee.id !== owner?.id);
      } else actor = owner;
      if (!actor || actor.status === "Paused") return;
      eventDescription = "Assignment activity: \"" + job.title + "\" is now " + job.status +
        ". Assigned employee: " + (owner?.name || "Unassigned") +
        ". Brief: " + (job.description || "No brief supplied.") +
        (job.reviewNote ? "\nReview feedback: " + job.reviewNote : "") +
        (job.result && job.status === "Submitted" ? "\nSubmitted deliverable:\n" + job.result.slice(0, 5000) : "");
    }

    if (!actor) return;
    const processEvent = async () => {
      teamPulseLockRef.current = true;
      const eventKey = latestEvent.key;
      lastTeamPulseRef.current = eventKey;
      try {
        if (latestEvent.kind === "job") destination = await ensureCollaborationRoom();
        if (!destination) return;

        const model = freeModels.some((item) => item.id === actor?.model)
          ? actor.model
          : freeModels[0]?.id ?? fallbackFreeModels[0].id;
        const recentHistory = destination.messages.slice(-12).map((message) =>
          (message.from === "you" ? "Owner" : employeeMap.get(message.from)?.name || "Colleague") + ": " + message.text
        ).join("\n\n");
        const prompt = [
          {
            role: "system",
            content: "You are " + actor.name + ", " + actor.role + " at " + company.name +
              ". Tone: " + actor.tone + ". Instructions: " + (actor.instructions || "Be accurate, useful and professional.") +
              ". Decide independently whether you have a useful contribution to the latest event. You may answer, ask a relevant question, review submitted work, suggest a concrete next action, or stay silent. Use only supplied facts. Do not invent progress or claim actions you have not completed. Reply in natural Markdown or plain text, never JSON. If there is nothing useful to add, return exactly [NO_REPLY]. Avoid filler acknowledgements."
          },
          {
            role: "user",
            content: "LATEST WORKSPACE EVENT:\n" + eventDescription +
              "\n\nRECENT CONVERSATION:\n" + (recentHistory || "No previous conversation.") +
              "\n\nOPEN ASSIGNMENTS:\n" + (jobs.filter((job) => job.status !== "Approved").slice(0, 8)
                .map((job) => "- " + job.title + " (" + job.status + ")").join("\n") || "None")
          }
        ];

        const draftKey = destination.id + ":" + actor.id;
        let streamed = "";
        setLiveChatDrafts((old) => ({ ...old, [draftKey]: "" }));
        const response = await requestOpenRouter(model, prompt, openRouterKey, (chunk) => {
          streamed += chunk;
          const visible = streamed.trimStart();
          if (!"[[NO_REPLY]]".startsWith(visible)) {
            setLiveChatDrafts((old) => ({ ...old, [draftKey]: streamed }));
          }
        });
        setLiveChatDrafts((old) => {
          const next = { ...old };
          delete next[draftKey];
          return next;
        });

        const reply = response.trim();
        if (!reply || reply === "[[NO_REPLY]]") {
          teamChainRef.current = 0;
          return;
        }

        const message: Message = {
          id: crypto.randomUUID(),
          from: actor.id,
          text: reply,
          time: nowTime(),
          createdAt: new Date().toISOString(),
          jobId: latestEvent.kind === "job" ? latestEvent.job.id : undefined
        };
        appendAgentMessages(destination, [message]);
        teamChainRef.current += 1;
        if (teamChainRef.current >= 8) {
          lastTeamPulseRef.current = "message:" + message.id;
          teamChainRef.current = 0;
        }
      } catch (error) {
        notify("Event-driven collaboration could not run: " + describeError(error, "Unknown AI error"));
        teamChainRef.current = 0;
      } finally {
        setLiveChatDrafts({});
        teamPulseLockRef.current = false;
        setConversations((old) => old.slice());
      }
    };
    void processEvent();
  }, [demoMode, user?.id, company?.id, loadedCompanyId, settings.autoRun, settings.connectors, openRouterKey, jobs, employees, conversations, freeModels, busy]);

  const approveJob = (jobId: string) => { setJobs((old) => old.map((j) => j.id === jobId ? { ...j, status: "Approved", reviewNote: "", reviewedBy: user?.id } : j)); setEmployees((old) => old.map((e) => e.id === jobs.find((j) => j.id === jobId)?.employeeId ? { ...e, status: "Available", task: undefined } : e)); notify("Work approved"); };
  const startJob = (jobId: string) => { const job = jobs.find((item) => item.id === jobId); if (!job) return; setJobs((old) => old.map((item) => item.id === jobId ? { ...item, status: "In progress" } : item)); setEmployees((old) => old.map((employee) => employee.id === job.employeeId ? { ...employee, status: "Working", task: job.title } : employee)); notify("Job started"); };
  const requestRevision = (jobId: string) => { if (!reviewNote.trim()) { notify("Add a note explaining what needs to change"); return; } setJobs((old) => old.map((j) => j.id === jobId ? { ...j, status: "Rejected", reviewNote: reviewNote.trim() } : j)); notify("Revision requested — feedback saved to the job"); };
  const deleteJob = async (jobId: string) => { if (company && !demoMode) { const { error } = await supabase.from("jobs").delete().eq("id", jobId).eq("company_id", company.id); if (error) { notify("Could not delete job: " + error.message); return; } } setJobs((old) => old.filter((j) => j.id !== jobId)); setSelectedJobId((current) => current === jobId ? null : current); notify(demoMode ? "Demo job removed for this session" : "Job deleted"); };
  const createCompany = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyName.trim()) return;
    setAuthBusy(true);
    try {
      if (demoMode) {
        const name = companyName.trim();
        const item: Company = { id: crypto.randomUUID(), name, industry: "Demo workspace", initials: initials(name), color: "blue", description: "Session-only demo workspace" };
        setCompanies((old) => [item, ...old]); setCompanyName(""); setShowCompanyForm(false);
        await openCompany(item); notify("Demo workspace created for this session");
        return;
      }
      // Read the current authenticated identity immediately before the insert so the
      // RLS ownership check uses the same user as the access token sent by Supabase.
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const authenticatedUser = authData.user;
      if (!authenticatedUser) throw new Error("Your session has expired. Sign in again before creating a workspace.");
      const name = companyName.trim();
      const { data: createdResult, error } = await supabase.rpc("create_company_workspace", { p_name: name, p_industry: "New workspace" }).single();
      if (error) throw error;
      const created = createdResult as { id: string; name: string; industry: string } | null;
      if (!created) throw new Error("Supabase did not return the created workspace.");
      const companyId = created.id;
      const deptIds = new Map(seedDepts.map((dept) => [dept.id, crypto.randomUUID()]));
      const departmentRows = seedDepts.map((dept) => ({ id: deptIds.get(dept.id), company_id: companyId, name: dept.name, parent_id: dept.parentId ? deptIds.get(dept.parentId) : null }));
      const { error: deptError } = await supabase.from("departments").insert(departmentRows);
      if (deptError) throw deptError;
      const employeeIds = new Map(seedEmployees.map((employee) => [employee.id, crypto.randomUUID()]));
      const employeeRows = seedEmployees.map((employee) => ({ id: employeeIds.get(employee.id), company_id: companyId, department_id: deptIds.get(employee.deptId) ?? null, name: employee.name, role: employee.role, tone: employee.tone, model: employee.model, custom_instructions: employee.instructions, status: "available" }));
      const { error: employeeError } = await supabase.from("employees").insert(employeeRows);
      if (employeeError) throw employeeError;
      const managerUpdates = await Promise.all(seedEmployees.filter((employee) => employee.managerId).map((employee) => supabase.from("employees").update({ manager_id: employeeIds.get(employee.managerId!) }).eq("id", employeeIds.get(employee.id)).eq("company_id", companyId)));
      const managerError = managerUpdates.find((result) => result.error)?.error;
      if (managerError) throw managerError;
      const teamId = crypto.randomUUID();
      const { error: convError } = await supabase.from("conversations").insert({ id: teamId, company_id: companyId, name: "Company team", kind: "group", created_by: authenticatedUser.id });
      if (convError) throw convError;
      const memberRows = [{ company_id: companyId, conversation_id: teamId, user_id: authenticatedUser.id, employee_id: null }, ...Array.from(employeeIds.values()).map((employeeId) => ({ company_id: companyId, conversation_id: teamId, user_id: null, employee_id: employeeId }))];
      const { error: memberError } = await supabase.from("conversation_members").insert(memberRows);
      if (memberError) throw memberError;
      const item: Company = { id: companyId, name: created.name, industry: created.industry, initials: initials(created.name), color: "blue", description: "Shared cloud workspace" };
      setCompanies((old) => [item, ...old]); setCompanyName(""); setShowCompanyForm(false);
      await openCompany(item);
      notify("Cloud workspace created");
    } catch (error) {
      notify("Could not create workspace: " + describeError(error, "Unknown database error"));
    } finally { setAuthBusy(false); }
  };
  const createGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (!company || !user || !goalTitle.trim()) return;
    const goal: Goal = { id: crypto.randomUUID(), title: goalTitle.trim(), description: goalDescription.trim(), progress: 0, dueDate: goalDueDate || undefined, status: "active", createdBy: user.id };
    if (!demoMode) {
      const { error } = await supabase.from("goals").insert({ id: goal.id, company_id: company.id, title: goal.title, description: goal.description, progress: 0, due_date: goal.dueDate ?? null, status: goal.status, created_by: user.id });
      if (error) { notify("Could not create goal: " + error.message); return; }
    }
    setGoals((old) => [goal, ...old]); setGoalTitle(""); setGoalDescription(""); setGoalDueDate(""); setShowGoalForm(false); notify("Goal created");
  };
  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (demoMode || !company || !user || !inviteEmail.trim()) return;
    setInviteBusy(true);
    try {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(random).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.from("company_invites").insert({
        company_id: company.id, invited_email: inviteEmail.trim().toLowerCase(), role: inviteRole,
        token_hash: tokenHash, created_by: user.id, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
      if (error) throw error;
      const url = new URL(import.meta.env.BASE_URL, window.location.origin);
      url.searchParams.set("invite", token);
      setInviteUrl(url.toString());
      notify("Invitation link created. It expires in seven days.");
    } catch (error) {
      notify("Could not create invitation: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally { setInviteBusy(false); }
  };
  const createEmployee = (event: FormEvent) => {
    event.preventDefault(); if (!employeeName.trim() || !employeeRole.trim()) return;
    if (!newEmployeeManager) { notify("Choose a manager or select the top of the hierarchy."); return; }
    const id = crypto.randomUUID();
    const managerId = newEmployeeManager === "__none__" ? undefined : newEmployeeManager;
    if (managerId && !employees.some((employee) => employee.id === managerId)) { notify("Choose a valid manager."); return; }
    const employee: Employee = { id, name: employeeName.trim(), role: employeeRole.trim(), deptId: newEmployeeDept || depts[0]?.id || "", ...(managerId ? { managerId } : {}), tone: "Clear & concise", model: "meta-llama/llama-3.3-70b-instruct:free", instructions: "", status: "Available" };
    setEmployees((old) => [...old, employee]);
    setEmployeeName(""); setEmployeeRole(""); setNewEmployeeDept(depts[0]?.id ?? "__root__"); setNewEmployeeManager(""); setShowEmployeeForm(false); setSelectedEmployee(id); notify("Employee created and reporting line saved");
  };
  const createDepartment = (event: FormEvent) => {
    event.preventDefault();
    const name = departmentName.trim();
    if (!name) return;
    const parentId = newDepartmentParent === "__root__" ? undefined : newDepartmentParent;
    if (parentId && !depts.some((department) => department.id === parentId)) { notify("Choose a valid parent department."); return; }
    if (depts.some((department) => department.name.toLocaleLowerCase() === name.toLocaleLowerCase() && (department.parentId ?? "__root__") === (parentId ?? "__root__"))) { notify("A department with that name already exists at this level."); return; }
    setDepts((old) => [...old, { id: crypto.randomUUID(), name, parentId }]);
    setDepartmentName(""); setNewDepartmentParent("__root__"); setShowDepartmentForm(false); notify(parentId ? "Nested department created" : "Department created");
  };
  const createConversation = async (event: FormEvent) => {
    event.preventDefault();
    if (!newChatName.trim() || !company || !user) return;
    const members = newChatMembers.length ? newChatMembers : employees[0] ? [employees[0].id] : [];
    const id = crypto.randomUUID();
    const chat: Conversation = { id, name: newChatName.trim(), kind: members.length > 1 ? "group" : "private", members, messages: [], createdBy: user.id };
    if (!demoMode) {
      const { error } = await supabase.from("conversations").insert({ id, company_id: company.id, name: chat.name, kind: chat.kind, created_by: user.id });
      if (error) { notify("Could not create conversation: " + error.message); return; }
      const membershipRows = [{ company_id: company.id, conversation_id: id, user_id: user.id, employee_id: null }, ...members.map((employeeId) => ({ company_id: company.id, conversation_id: id, user_id: null, employee_id: employeeId }))];
      const { error: membershipError } = await supabase.from("conversation_members").insert(membershipRows);
      if (membershipError) { notify("Conversation created, but members could not be added: " + membershipError.message); }
    }
    setConversations((old) => [chat, ...old]); setSelectedChat(id); setNewChatName(""); setNewChatMembers([]); setShowChatForm(false); setPage("Communication");
  };
  const openChatWith = async (id: string) => {
    const found = conversations.find((c) => c.members.length === 1 && c.members[0] === id && c.kind === "private");
    if (found) setSelectedChat(found.id);
    else {
      if (!company || !user) return;
      const e = employeeMap.get(id); const conversationId = crypto.randomUUID();
      const created: Conversation = { id: conversationId, name: e?.name ?? "Employee", kind: "private", members: [id], messages: [], createdBy: user.id };
      if (!demoMode) {
        const { error } = await supabase.from("conversations").insert({ id: conversationId, company_id: company.id, name: created.name, kind: "private", created_by: user.id });
        if (error) { notify("Could not open conversation: " + error.message); return; }
        const { error: membershipError } = await supabase.from("conversation_members").insert([{ company_id: company.id, conversation_id: conversationId, user_id: user.id, employee_id: null }, { company_id: company.id, conversation_id: conversationId, user_id: null, employee_id: id }]);
        if (membershipError) { notify("Could not add conversation members: " + membershipError.message); return; }
      }
      setConversations((old) => [created, ...old]); setSelectedChat(created.id);
    }
    setPage("Communication");
  };
  const employeeNameFor = (id: string) => id === "you" ? "You" : id === "teammate" ? "Teammate" : employeeMap.get(id)?.name ?? "AutoBusiness";
  const filteredEmployees = employees.filter((e) => (e.name + " " + e.role + " " + (depts.find((d) => d.id === e.deptId)?.name ?? "") + " " + (employeeMap.get(e.managerId ?? "")?.name ?? "")).toLowerCase().includes(search.toLowerCase()));
  const managerNameFor = (managerId?: string) => managerId ? employeeMap.get(managerId)?.name ?? "Unassigned manager" : "You";
  const isEmployeeDescendant = (candidateId: string, ancestorId: string) => { let current = employeeMap.get(candidateId); const visited = new Set<string>(); while (current?.managerId && !visited.has(current.id)) { if (current.managerId === ancestorId) return true; visited.add(current.id); current = employeeMap.get(current.managerId); } return false; };
  const departmentPath = (departmentId?: string) => {
    if (!departmentId) return "Unassigned";
    const parts: string[] = []; const seen = new Set<string>(); let current = depts.find((department) => department.id === departmentId);
    while (current && !seen.has(current.id)) { seen.add(current.id); parts.unshift(current.name); current = current.parentId ? depts.find((department) => department.id === current?.parentId) : undefined; }
    return parts.join(" / ") || "Unassigned";
  };
  const departmentTree = (parent?: string, depth = 0): JSX.Element[] => depts.filter((d) => d.parentId === parent).flatMap((d) => {
    const members = filteredEmployees.filter((e) => e.deptId === d.id);
    const children = departmentTree(d.id, depth + 1);
    return [<div className="department" key={d.id}>
      <div className="department-label" style={{ paddingLeft: 10 + depth * 14 }}><span className="department-dot" />{d.name}<span className="muted-count">{members.length}</span><button type="button" className="tiny-icon dept-add-button" title={"Add subdepartment under " + d.name} aria-label={"Add subdepartment under " + d.name} onClick={(event) => { event.stopPropagation(); setDepartmentName(""); setNewDepartmentParent(d.id); setShowDepartmentForm(true); }}><Plus size={12} /></button></div>
      {members.map((e) => <button className={"employee-row " + (selectedEmployee === e.id ? "selected" : "")} key={e.id} style={{ marginLeft: e.managerId && members.some((candidate) => candidate.id === e.managerId) ? 14 : 0 }} onClick={() => { setSelectedEmployee(e.id); setProfileEmployeeId(e.id); setMobileContextOpen(false); }}><span className={"avatar small " + (e.status === "Working" ? "avatar-violet" : "")}>{initials(e.name)}</span><span className="employee-row-copy"><strong>{e.name}</strong><small>{e.role} · reports to {managerNameFor(e.managerId)}</small></span><span className={"status-dot " + e.status.toLowerCase().replace(" ", "-")} /></button>)}
      {children}
    </div>];
  });

  if (authLoading) return <div className="home-shell auth-loading"><div className="brand"><span className="brand-mark"><Command size={19} /></span><span>autobusiness</span></div><p>Connecting securely to your workspace…</p></div>;
  if (!user) return <div className="home-shell">
    <header className="home-top"><div className="brand"><span className="brand-mark"><Command size={19} /></span><span>autobusiness</span></div><span className="workspace-chip"><LockKeyhole size={14} /> Secure sign-in</span></header>
    <main className="auth-content">
      <div className="auth-card">
        <div className="eyebrow"><ShieldCheck size={14} /> PRIVATE COMPANY WORKSPACES</div>
        <h1>{authMode === "signin" ? "Welcome back." : "Create your account."}</h1>
        <p className="home-subtitle">{authMode === "signin" ? "Sign in to access your companies and shared work." : "Create an account to set up your first cloud workspace."}</p>
        <form className="auth-form" onSubmit={handleAuthSubmit}>
          <label>Email address<input type="email" autoComplete="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@company.com" required /></label>
          <label>Password<input type="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} minLength={8} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 8 characters" required /></label>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          {authNotice && <p className="auth-notice" role="status">{authNotice}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <div className="auth-demo-actions"><button type="button" className="secondary-button demo-launch-button" onClick={startInteractiveDemo}><Sparkles size={15} /> Explore interactive demo</button><p>Sample company and tasks. Changes stay in this session and are not saved to an account.</p></div>
        <p className="auth-switch">{authMode === "signin" ? "New to AutoBusiness?" : "Already have an account?"} <button type="button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(""); setAuthNotice(""); }}>{authMode === "signin" ? "Create an account" : "Sign in instead"}</button></p>
        <div className="auth-security-note"><LockKeyhole size={14} /> Your company data is stored in Supabase and protected by company membership policies.</div>
      </div>
    </main>
  </div>;
  if (!company) return <div className="home-shell">
    <header className="home-top"><div className="brand"><span className="brand-mark"><Command size={19} /></span><span>autobusiness</span></div><span className="workspace-chip"><span className="online-dot" /> Your workspace</span></header>
    <main className="home-content">
      <div className="eyebrow"><Sparkles size={14} /> YOUR AI OPERATING TEAM</div>
      <h1>Good work starts<br />with the right team.</h1>
      <p className="home-subtitle">Choose a shared cloud workspace or create a new company.</p>
      <div className="company-grid">
        {companies.map((c) => <button className="company-card" key={c.id} onClick={() => { void openCompany(c); }}>
          <div className={"company-icon " + c.color}>{c.initials}</div><div className="company-card-top"><strong>{c.name}</strong><ChevronRight size={17} /></div><span className="company-industry">{c.industry}</span><p>{c.description}</p><div className="company-card-footer"><span><LockKeyhole size={13} /> Cloud saved</span><span className="workspace-open">Open workspace <ArrowUpRight size={14} /></span></div>
        </button>)}
        {loadingCompanies && <div className="empty-state">Loading your companies…</div>}{!loadingCompanies && companies.length === 0 && <div className="empty-state company-empty"><strong>No company workspaces yet</strong><p>Create your first workspace to start building your AI team.</p></div>}<button className="company-card add-company" onClick={() => setShowCompanyForm(true)}><span className="add-circle"><Plus size={20} /></span><strong>Create a company</strong><p>Start a new workspace for another business.</p></button>
      </div>
      <div className="home-footnote"><LockKeyhole size={13} /> Signed in as {user.email ?? "your account"} · Company data is saved to Supabase.</div>{toast && <div className="toast"><Check size={15} />{toast}</div>}<button className="auth-signout-link" onClick={() => void signOut()}>Sign out</button>
    </main>
    {showCompanyForm && <div className="modal-backdrop" onClick={() => setShowCompanyForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createCompany}><button type="button" className="modal-close" onClick={() => setShowCompanyForm(false)}>×</button><h2>Create a company</h2><p>Give your workspace a name to get started.</p><label>Company name<input autoFocus value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Northstar Studio" required /></label><button className="primary-button" type="submit">Create workspace</button></form></div>}
  </div>;

  if (loadingWorkspace && company) return <div className="home-shell auth-loading"><div className="brand"><span className="brand-mark"><Command size={19} /></span><span>autobusiness</span></div><p>Loading {company.name} from the cloud…</p></div>;
  return <div className="app-shell">
    <header className="app-topbar">
      <div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setMobileContextOpen((open) => !open)} aria-label={mobileContextOpen ? "Close contextual navigation" : "Open contextual navigation"} aria-expanded={mobileContextOpen}><Menu size={18} /></button><div className="brand compact"><span className="brand-mark"><Command size={17} /></span><span>autobusiness</span></div><span className="topbar-divider" /><button className="company-switcher" onClick={() => { setLoadedCompanyId(null); setCompany(null); }}><span className={"company-mini " + company.color}>{company.initials}</span>{company.name}<ChevronDown size={14} /></button></div>
      <div className="topbar-right">{demoMode ? <><span className="demo-status"><span className="demo-dot" /> Demo · session only</span><button className="demo-exit-button" onClick={() => void signOut()}>Exit demo</button></> : <><span className="saved-indicator"><span className="online-dot" /> Supabase connected</span><button className="profile-button" title={"Sign out " + (user?.email ?? "")} onClick={() => void signOut()}>{initials(user?.email?.split("@")[0] ?? "U")}</button></>}<button className="icon-button" title="Help and quick guide" aria-label="Help and quick guide" onClick={() => setShowHelp(true)}><CircleHelp size={17} /></button></div>
    </header>
    <div className="app-body">
      <aside className="sidebar primary-sidebar">
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav">{nav.map(({ label, icon: Icon, count }) => <button key={label} title={label} className={"nav-item " + (page === label ? "active" : "")} onClick={() => changePage(label)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count ? <span className="nav-count">{count}</span> : null}</button>)}</nav>
      </aside>
      <aside className={"sidebar context-sidebar " + (mobileContextOpen ? "mobile-open" : "")}>
        <div className="context-sidebar-heading"><span>{page === "Communication" ? "COMMUNICATION" : page === "Management" ? "MANAGEMENT" : page === "Settings" ? "SETTINGS" : page.toUpperCase()}</span></div>
        {page === "Communication" ? <>
          <div className="side-section-head"><span>CONVERSATIONS</span><button className="tiny-icon" onClick={() => { setShowChatForm(true); setMobileContextOpen(false); }} title="New conversation"><Plus size={15} /></button></div>
          {conversations.filter((c) => c.kind === "group").map((c) => <button key={c.id} className={"chat-list-item " + (selectedChat === c.id ? "chosen" : "")} onClick={() => setSelectedChat(c.id)}><span className="chat-avatar team-avatar"><Users size={15} /></span><span className="chat-label"><strong>{c.name}</strong><small>Group conversation</small></span></button>)}
          {conversations.filter((c) => c.kind !== "group").map((c) => <button key={c.id} className={"chat-list-item " + (selectedChat === c.id ? "chosen" : "")} onClick={() => setSelectedChat(c.id)}><span className="avatar tiny">{initials(c.name)}</span><span className="chat-label"><strong>{c.name}</strong><small>{c.messages.at(-1)?.text ?? "Start a conversation"}</small></span></button>)}
          <button className="side-new-button" onClick={() => setShowChatForm(true)}><Plus size={14} /> New conversation</button>
        </> : page === "Management" ? <>
          <div className="side-section-head"><span>YOUR TEAM</span><button className="tiny-icon" onClick={() => setShowEmployeeForm(true)} title="Add employee"><Plus size={15} /></button></div>
          <div className="employee-search"><Search size={14} /><input placeholder="Find an employee" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="department-list">{departmentTree()}</div><button className="side-new-button" onClick={() => { setDepartmentName(""); setNewDepartmentParent("__root__"); setShowDepartmentForm(true); }}><Plus size={14} /> Add department</button><button className="side-new-button" onClick={() => { setNewEmployeeManager(""); setShowEmployeeForm(true); }}><Plus size={14} /> Add employee</button>
        </> : page === "Settings" ? <>
          <div className="side-section-head"><span>SETTINGS</span></div>
          {[{ label: "General", icon: Settings2 }, { label: "Security", icon: ShieldCheck }, { label: "Rulesets", icon: LockKeyhole }, { label: "Connectors", icon: Workflow }, { label: "Automation & limits", icon: Gauge }].map(({ label, icon: SettingIcon }) => <button key={label} title={label} className={"nav-item subnav " + (activeSettings === label ? "active" : "")} onClick={() => { setActiveSettings(label); setMobileContextOpen(false); }}><SettingIcon size={20} /><span>{label}</span></button>)}
        </> : <>
          <div className="side-section-head"><span>QUICK ACCESS</span></div>
          <button className="quick-link" onClick={() => changePage("Jobs & approvals")}><Inbox size={15} /><span>Needs your review</span><span className="nav-count">{jobs.filter((j) => j.status === "Submitted").length}</span></button>
          <button className="quick-link" onClick={() => changePage("Communication")}><MessageCircle size={15} /><span>Team messages</span></button>
          <div className="side-card"><div className="side-card-icon"><Zap size={15} /></div><strong>Your AI team</strong><p>Delegate work, review submissions, and keep everything moving.</p></div>
        </>}
        <div className="sidebar-bottom"><div className="usage-mini"><div className="usage-mini-top"><span>JOB COMPLETION</span><span>{jobs.filter((j) => j.status === "Approved").length} / {jobs.length}</span></div><div className="usage-track"><span style={{ width: (jobs.length ? jobs.filter((j) => j.status === "Approved").length / jobs.length * 100 : 0) + "%" }} /></div><small>Approved jobs in this workspace</small></div><button className="sidebar-company" onClick={() => setCompany(null)}><span className={"company-mini " + company.color}>{company.initials}</span><span><strong>{company.name}</strong><small>Free workspace</small></span><MoreHorizontal size={17} /></button></div>
      </aside>
      <main className="main-panel">
        {page === "Dashboard" && <div className="page-wrap">
          <div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Overview</div><h1>Welcome back, {(user?.email?.split("@")[0] ?? "there").replace(/[._-]/g, " ")} <span className="wave">✳</span></h1><p>Here’s what’s happening across {company.name} today.</p></div></div>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-card-top"><span>Employees</span><span className="stat-icon lavender"><Users size={17} /></span></div><div className="stat-value">{employees.length}</div><div className="stat-caption">{employees.filter((e) => e.status === "Working").length} working right now</div></div>
            <div className="stat-card"><div className="stat-card-top"><span>Jobs in progress</span><span className="stat-icon blue-bg"><Activity size={17} /></span></div><div className="stat-value">{jobs.filter((j) => j.status === "In progress" || j.status === "Queued").length}<span className="stat-trend">{jobs.filter((j) => j.status === "Queued").length} queued</span></div><div className="stat-caption">Across all departments</div></div>
            <div className="stat-card"><div className="stat-card-top"><span>Awaiting review</span><span className="stat-icon amber-bg"><Inbox size={17} /></span></div><div className="stat-value">{jobs.filter((j) => j.status === "Submitted").length}<span className="stat-trend attention">Needs attention</span></div><div className="stat-caption">Submitted by your team</div></div>
            <div className="stat-card"><div className="stat-card-top"><span>Deliverables created</span><span className="stat-icon green-bg"><Gauge size={17} /></span></div><div className="stat-value">{jobs.filter((j) => Boolean(j.result?.trim())).length}</div><div className="usage-track stat-track"><span style={{ width: (jobs.length ? jobs.filter((j) => Boolean(j.result?.trim())).length / jobs.length * 100 : 0) + "%" }} /></div><div className="stat-caption">{jobs.filter((j) => j.status === "Approved").length} approved · {jobs.length} total jobs</div></div>
          </div>
          <div className="dashboard-grid">
            <section className="panel jobs-panel"><div className="panel-heading"><div><h2>Jobs & requests</h2><p>Keep an eye on what needs attention.</p></div><button className="text-button" onClick={() => changePage("Jobs & approvals")}>View all <ArrowUpRight size={14} /></button></div>
              <div className="job-list">{jobs.slice(0, 4).map((job) => { const emp = employeeMap.get(job.employeeId); return <div className="job-row" key={job.id}><span className="avatar">{initials(emp?.name ?? "AI")}</span><div className="job-copy"><strong>{job.title}</strong><span>{emp?.name ?? "Unassigned"} <span className="dot-sep">·</span> {new Date(job.created).toLocaleString()}</span></div><span className={"job-status " + job.status.toLowerCase().replace(" ", "-")}>{job.status}</span>{job.status === "Submitted" && <button className="secondary-button compact-button" onClick={() => setSelectedJobId(job.id)}>View work</button>}</div>; })}</div>
              {jobs.length === 0 && <div className="empty-state">No jobs yet. Assign your first task to get started.</div>}
              <button className="panel-footer-link" onClick={() => setShowJobForm(true)}><Plus size={15} /> Create a new job</button>
            </section>
            <section className="panel team-panel"><div className="panel-heading"><div><h2>Your team</h2><p>A quick look at your employees.</p></div><button className="text-button" onClick={() => changePage("Management")}>View team <ArrowUpRight size={14} /></button></div>
              <div className="team-list">{employees.slice(0, 5).map((e) => <button className="team-person" key={e.id} onClick={() => { setSelectedEmployee(e.id); setPage("Management"); }}><span className="avatar">{initials(e.name)}</span><span className="team-person-copy"><strong>{e.name}</strong><small>{e.role}</small></span><span className={"presence " + e.status.toLowerCase().replace(" ", "-")}><i />{e.status}</span></button>)}</div>
            </section>
            <section className="panel goals-panel"><div className="panel-heading"><div><h2>Goals & progress</h2><p>Live goals saved to this workspace.</p></div><button className="icon-button subtle" onClick={() => setShowGoalForm(true)} title="Add goal"><Plus size={17} /></button></div>{goals.map((goal) => <div className="goal-item" key={goal.id}><div className="goal-top"><span className="goal-mark purple-mark"><ArrowUpRight size={14} /></span><div><strong>{goal.title}</strong><small>{goal.dueDate ? "Due " + goal.dueDate : goal.status}</small></div><b>{Math.round(goal.progress)}%</b></div><div className="goal-progress"><span style={{ width: goal.progress + "%" }} /></div><input className="goal-progress-input" type="range" min="0" max="100" step="5" value={goal.progress} aria-label={"Progress for " + goal.title} onChange={(e) => { const progress = Number(e.target.value); setGoals((old) => old.map((g) => g.id === goal.id ? { ...g, progress, status: progress === 100 ? "completed" : "active" } : g)); }} /></div>)}{goals.length === 0 && <div className="empty-state"><strong>No goals yet</strong><p>Add a measurable goal to track progress here.</p></div>}<button className="panel-footer-link" onClick={() => setShowGoalForm(true)}><Plus size={15} /> Add a goal</button></section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Recent job updates from this workspace.</p></div><Clock3 size={16} className="muted-icon" /></div><div className="activity-list">{jobs.slice(0, 4).map((job) => <div className="activity-item" key={job.id}><span className="activity-bullet violet-bullet">{job.status === "Approved" ? <CheckCheck size={13} /> : <Inbox size={13} />}</span><div><p><strong>{job.title}</strong> · {job.status.toLowerCase()}</p><small>{new Date(job.created).toLocaleString()}</small></div></div>)}{jobs.length === 0 && <div className="empty-state">Job activity will appear here when you assign work.</div>}</div></section>
          </div>
        </div>}
        {page === "Management" && <div className="page-wrap management-page">
          <div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> People</div><h1>Management</h1><p>Your organisation, nested departments, reporting lines and AI employees.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => { setDepartmentName(""); setNewDepartmentParent("__root__"); setShowDepartmentForm(true); }}><Plus size={15} /> Add department</button><button className="primary-button" onClick={() => { setNewEmployeeManager(""); setShowEmployeeForm(true); }}><Plus size={16} /> Add employee</button></div></div>
          <div className="management-layout"><section className="panel management-tree"><div className="management-tree-head"><div><h2>Organisation</h2><p>{employees.length} employees · {depts.length} departments</p></div><button className="text-button" onClick={() => { setDepartmentName(""); setNewDepartmentParent("__root__"); setShowDepartmentForm(true); }}><Plus size={14} /> Add department</button></div><div className="org-tree">{departmentTree()}</div>{filteredEmployees.length === 0 && <div className="empty-state">No employees match your search.</div>}</section>
          {activeEmployee && <section className="panel employee-detail"><div className="employee-profile-head"><div className="avatar large">{initials(activeEmployee.name)}</div><div className="employee-profile-title"><h2>{activeEmployee.name}</h2><p>{activeEmployee.role}</p><span className={"presence " + activeEmployee.status.toLowerCase().replace(" ", "-")}><i />{activeEmployee.status}</span></div><button className="icon-button subtle" title={activeEmployee.status === "Paused" ? "Resume employee" : "Pause employee"} aria-label={activeEmployee.status === "Paused" ? "Resume employee" : "Pause employee"} onClick={() => { const resume = activeEmployee.status === "Paused"; setEmployees((old) => old.map((employee) => employee.id === activeEmployee.id ? { ...employee, status: resume ? (employee.task ? "Working" : "Available") : "Paused" } : employee)); notify(resume ? activeEmployee.name + " resumed" : activeEmployee.name + " paused"); }}><MoreHorizontal size={18} /></button></div>
            <button className="primary-button full-button" onClick={() => openChatWith(activeEmployee.id)}><MessageCircle size={16} /> Open conversation</button>
            
            <div className="detail-divider" /><div className="detail-section-title">REPORTING LINE</div><div className="reporting-summary"><span className="reporting-label">Manager</span><strong>{managerNameFor(activeEmployee.managerId)}</strong></div>{employees.filter((employee) => employee.managerId === activeEmployee.id).length > 0 && <div className="reporting-summary"><span className="reporting-label">Direct reports</span><div className="reporting-people">{employees.filter((employee) => employee.managerId === activeEmployee.id).map((employee) => <button key={employee.id} onClick={() => { setSelectedEmployee(employee.id); setProfileEmployeeId(employee.id); }}><span className="avatar tiny">{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.role}</small></span></button>)}</div></div>}<div className="detail-section-title">CURRENT STATUS</div><div className="status-summary"><span className={"status-pulse " + activeEmployee.status.toLowerCase().replace(" ", "-")} /><div><strong>{activeEmployee.status}</strong><small>{activeEmployee.task ? "Currently focused on " + activeEmployee.task : "No active task assigned"}</small></div></div>
            <div className="detail-section-title">QUEUED JOBS</div>
            {jobs.filter((job) => job.employeeId === activeEmployee.id && ["Queued", "In progress", "Submitted"].includes(job.status)).map((job) => <div className="employee-job-mini" key={job.id}><span className="employee-job-copy"><strong>{job.title}</strong><small>{new Date(job.created).toLocaleString()}</small></span><span className={"job-status " + job.status.toLowerCase().replace(" ", "-")}>{job.status}</span></div>)}
            {!jobs.some((job) => job.employeeId === activeEmployee.id && ["Queued", "In progress", "Submitted"].includes(job.status)) && <p className="no-open-jobs">No open jobs assigned.</p>}
            <div className="detail-section-title">AI CONFIGURATION</div><label className="field-label">Department<select value={activeEmployee.deptId} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, deptId: e.target.value } : x))}>{depts.map((d) => <option key={d.id} value={d.id}>{departmentPath(d.id)}</option>)}</select></label><label className="field-label">Reports to<select value={activeEmployee.managerId ?? "__none__"} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, managerId: e.target.value === "__none__" ? undefined : e.target.value } : x))}><option value="__none__">You · top of hierarchy</option>{employees.filter((person) => person.id !== activeEmployee.id && !isEmployeeDescendant(person.id, activeEmployee.id)).map((person) => <option key={person.id} value={person.id}>{person.name} — {person.role}</option>)}</select></label>
            <label className="field-label">Communication tone<select value={activeEmployee.tone} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, tone: e.target.value } : x))}><option>Clear & concise</option><option>Thoughtful & creative</option><option>Warm & articulate</option><option>Analytical</option><option>Practical & direct</option><option>Curious & collaborative</option><option>Formal</option><option>Friendly</option></select></label>
            <label className="field-label">AI model<select value={freeModels.some((item) => item.id === activeEmployee.model) ? activeEmployee.model : freeModels[0]?.id ?? fallbackFreeModels[0].id} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, model: e.target.value } : x))}>{freeModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><small className="input-help">{modelsLoading ? "Loading current free model catalogue…" : "Only models with zero prompt and completion pricing are listed."}</small></label>
            <label className="field-label">Custom instructions<textarea rows={4} value={activeEmployee.instructions} onChange={(e) => setEmployees((old) => old.map((x) => x.id === activeEmployee.id ? { ...x, instructions: e.target.value } : x))} placeholder="How should this employee work?" /></label>
            <div className="detail-note"><ShieldCheck size={15} /><span>{demoMode ? "Changes are temporary and stay in this session." : "Changes are saved to your cloud workspace."}</span></div>
          </section>}
          </div>
        </div>}
        {page === "Communication" && <div className="chat-page">
          <div className="chat-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Communication</div><h1>Communication</h1><p>Talk to your team and coordinate work in one place.</p></div><button className="primary-button" onClick={() => setShowChatForm(true)}><Plus size={16} /> New conversation</button></div>
          <div className="chat-window panel"><div className="chat-main-head">{activeConversation && <><span className={"chat-avatar " + (activeConversation.kind === "group" ? "team-avatar" : "")}>{activeConversation.kind === "group" ? <Users size={17} /> : initials(activeConversation.name)}</span><div><strong>{activeConversation.name}</strong><small>{activeConversation.kind === "group" ? activeConversation.members.length + " team members" : "Private conversation"}</small></div></>}<button className={"icon-button subtle " + (showChatDetails ? "active" : "")} title="Conversation details and team directory" onClick={() => setShowChatDetails((open) => !open)}><MoreHorizontal size={18} /></button></div>
            {showChatDetails && <aside className="chat-details-panel"><div className="chat-details-title"><div><strong>People in this chat</strong><small>{activeConversation?.members.length ?? 0} employees</small></div><button className="tiny-icon" onClick={() => setShowChatDetails(false)} aria-label="Close people panel">×</button></div>{activeConversation?.members.length ? activeConversation.members.map((memberId) => employeeMap.get(memberId)).filter((e): e is Employee => Boolean(e) && (e!.name + " " + e!.role).toLowerCase().includes(search.toLowerCase())).map((e) => <button className="chat-detail-person" key={e.id} onClick={() => { setProfileEmployeeId(e.id); setShowChatDetails(false); }}><span className="avatar small">{initials(e.name)}</span><span><strong>{e.name}</strong><small>{e.role} · reports to {managerNameFor(e.managerId)}</small></span><ChevronRight size={15} /></button>) : <p className="chat-details-empty">No employees are in this conversation.</p>}</aside>}
            <div className="message-stream">{activeConversation?.messages.map((m) => <div key={m.id} className={"message-row " + (m.from === "you" ? "mine" : "")}><span className="avatar tiny">{initials(employeeNameFor(m.from))}</span><div className="message-content"><div className="message-meta"><strong>{employeeNameFor(m.from)}</strong><span>{m.time}</span></div><div className="message-bubble"><MarkdownPreview content={m.text} /></div>{m.jobId && <button className="message-job-link" onClick={() => { changePage("Jobs & approvals"); setSelectedJobId(m.jobId ?? null); }}><Inbox size={13} /> View job and deliverable</button>}</div></div>)}
              {Object.entries(liveChatDrafts).filter(([key, draft]) => key.startsWith((activeConversation?.id ?? "") + ":") && draft).map(([key, draft]) => { const employeeId = key.split(":")[1]; return <div className="message-row" key={key}><span className="avatar tiny">{initials(employeeNameFor(employeeId))}</span><div className="message-content"><div className="message-meta"><strong>{employeeNameFor(employeeId)}</strong><span>typing</span></div><div className="message-bubble streaming-bubble"><MarkdownPreview content={draft} /><span className="streaming-cursor" /></div></div></div>; })}
              {busy && !Object.keys(liveChatDrafts).some((key) => key.startsWith((activeConversation?.id ?? "") + ":")) && <div className="typing-indicator"><span /><span /><span /> A colleague is deciding whether to contribute…</div>}
              {!activeConversation?.messages.length && <div className="chat-empty"><span className="chat-empty-icon"><MessageCircle size={22} /></span><strong>Start the conversation</strong><p>Send a message. Employees decide whether to reply or open and complete assignments themselves.</p></div>}
            </div>
            <div className="chat-composer-area"><div className="composer-tools"><span>{demoMode ? "Demo messages stay in this session" : "Messages are saved to your cloud workspace"}</span></div><form className="chat-composer" onSubmit={sendMessage}><textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement)?.requestSubmit(); } }} placeholder={"Message " + (activeConversation?.name ?? "your team") + "…"} rows={2} /><button className="send-button" type="submit" disabled={!message.trim()} aria-label="Send message"><Send size={17} /></button></form><small className="composer-hint">Enter to send · Shift + Enter for a new line</small></div>
          </div>
        </div>}
        {page === "Jobs & approvals" && <div className="page-wrap"><div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Operations</div><h1>Jobs & approvals</h1><p>Track delegated work and review submitted results.</p></div></div><div className="job-filters"><span>{jobs.length} total jobs</span><span className="filter-pill">{jobs.filter((j) => j.status === "Queued").length} queued</span><span className="filter-pill review">{jobs.filter((j) => j.status === "Submitted").length} awaiting review</span><span className="filter-pill">{jobs.filter((j) => j.status === "Rejected").length} revisions</span></div><div className="job-toolbar"><label className="job-search"><Search size={15} /><input value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} placeholder="Search jobs, details, employees…" /></label><select value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)} aria-label="Filter jobs by status">{["All statuses", "Queued", "In progress", "Submitted", "Rejected", "Approved"].map((status) => <option key={status}>{status}</option>)}</select></div><div className="panel all-jobs">{filteredJobs.map((j) => { const emp = employeeMap.get(j.employeeId); return <div className="all-job-row" key={j.id}><span className="avatar">{initials(emp?.name ?? "AI")}</span><div className="all-job-copy"><strong>{j.title}</strong><small>Assigned to {emp?.name ?? "Unassigned"} · {new Date(j.created).toLocaleString()} · {j.priority}{j.description ? " · " + j.description : ""}</small></div><span className={"job-status " + j.status.toLowerCase().replace(" ", "-")}>{j.status}</span>{j.status === "Queued" && <button className="secondary-button compact-button" onClick={() => startJob(j.id)}>Start job</button>}{(j.status === "In progress" || j.status === "Rejected") && <button className="secondary-button compact-button" disabled={busy} onClick={() => { if (j.status === "Rejected") setJobs((old) => old.map((x) => x.id === j.id ? { ...x, status: "In progress" } : x)); void runJob(j.id); }}>{busy ? "Working…" : j.status === "Rejected" ? "Revise & regenerate" : "Generate work"}</button>}{j.status === "Submitted" && <button className="secondary-button compact-button" onClick={() => { setReviewNote(j.reviewNote ?? ""); setSelectedJobId(j.id); }}>Review work</button>}{j.status === "Rejected" && <button className="secondary-button compact-button" onClick={() => { setReviewNote(j.reviewNote ?? ""); setSelectedJobId(j.id); }}>View feedback</button>}{j.status === "Approved" && <span className="approved-check"><CheckCheck size={16} /> Complete</span>}{j.status === "Queued" && <button className="icon-button subtle" title="Delete job" aria-label={"Delete " + j.title} onClick={() => deleteJob(j.id)}>×</button>}</div>; })}{filteredJobs.length === 0 && <div className="empty-state">No jobs match these filters.</div>}</div></div>}
        {page === "Settings" && <div className="page-wrap settings-page"><div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={13} /> Configuration</div><h1>Settings</h1><p>Configure how your AI team works and what it can access.</p></div><span className="saved-badge"><Check size={13} /> {demoMode ? "Session only" : "Saved automatically"}</span></div><div className="settings-layout"><section className="panel settings-content">
          {activeSettings === "General" && <><h2>General preferences</h2><p className="settings-intro">Manage the basics for {company.name}.</p><label className="field-label">Company name<input value={company.name} onChange={(e) => { const updated = { ...company, name: e.target.value }; setCompany(updated); setCompanies((old) => old.map((item) => item.id === updated.id ? updated : item)); }} /></label>{!demoMode && (memberRole === "owner" || memberRole === "admin") && <div className="settings-info-row"><div><strong>Team access</strong><small>Invite a teammate by email. The link is limited to that email and expires in seven days.</small></div><button className="secondary-button compact-button" onClick={() => { setInviteUrl(""); setInviteEmail(""); setShowInviteForm(true); }}>Invite member</button></div>}<div className="settings-info-row"><div><strong>Data storage</strong><small>{demoMode ? "Changes remain in this session and are discarded when you exit." : "Workspace data is stored in Supabase and shared with authorised company members."}</small></div><span className={"setting-pill " + (demoMode ? "" : "green-pill")}>{demoMode ? "Session only" : "Cloud"}</span></div></>}
          {activeSettings === "Security" && <><h2>Security & permissions</h2><p className="settings-intro">Keep sensitive work under control.</p><div className="settings-info-row"><div><strong>Job approval policy</strong><small>{settings.approvalRequired ? "New assignments wait for approval before starting." : "New assignments can start without the approval gate; generation still requires a manual action."}</small></div><button className="secondary-button compact-button" onClick={() => setActiveSettings("Automation & limits")}>Change policy</button></div><div className="settings-info-row"><div><strong>External actions</strong><small>External publishing and connector writes should require explicit approval.</small></div><span className="setting-pill">Approval gated</span></div><div className="settings-info-row"><div><strong>Credentials</strong><small>Provider secrets must never be placed in frontend code. Use a server-side proxy for shared/public deployments.</small></div><span className="setting-pill">Protected</span></div></>}
          {activeSettings === "Rulesets" && <><h2>Rulesets</h2><p className="settings-intro">Company-wide guardrails applied to every employee.</p><div className="rule-card"><span className="rule-icon"><ShieldCheck size={17} /></span><div><strong>Human approval for consequential actions</strong><small>Publishing, sending messages externally, spending and deleting data require confirmation.</small></div><span className="setting-pill green-pill">Enabled</span></div><div className="rule-card"><span className="rule-icon"><LockKeyhole size={17} /></span><div><strong>Keep company data private</strong><small>Employees should only use the context required for their assigned work.</small></div><span className="setting-pill green-pill">Enabled</span></div><div className="rule-card"><span className="rule-icon"><CheckCheck size={17} /></span><div><strong>Require evidence in submissions</strong><small>Ask employees to include the result, relevant links and unresolved issues.</small></div><span className="setting-pill green-pill">Enabled</span></div></>}
          {activeSettings === "Connectors" && <>
            <h2>AI provider & connectors</h2>
            <p className="settings-intro">Only models with zero prompt and completion prices are offered.</p>
            {demoMode ? <div className="demo-connector-notice"><Sparkles size={16} /><div><strong>Provider connections are simulated in demo mode</strong><p>No API key is read, saved, or used for demo replies and sample deliverables. Sign in to configure an AI provider for real work.</p></div></div> : <><div className="openrouter-key-card">
              <label className="field-label">OpenRouter API key
                <input type="password" autoComplete="off" value={openRouterKey} onChange={(e) => { setOpenRouterKey(e.target.value); window.localStorage.setItem(openRouterKeyName, e.target.value); }} placeholder="Paste an OpenRouter API key" />
              </label>
              <p className="small-disclaimer">This static app sends requests directly from the browser. A key stored here can be inspected on this device; a server-side proxy is safer for shared/public use.</p>
              <div className="settings-info-row">
                <div><strong>OpenRouter</strong><small>{openRouterKey.trim() ? "API key saved in this browser." : "Add your key to enable AI replies and employee deliverables."}</small></div>
                <button className={"connector-action " + (settings.connectors.includes("OpenRouter") ? "enabled" : "")} onClick={() => setSettings((old) => ({ ...old, connectors: old.connectors.includes("OpenRouter") ? old.connectors.filter((x) => x !== "OpenRouter") : [...old.connectors, "OpenRouter"] }))}>{settings.connectors.includes("OpenRouter") ? "Enabled" : "Enable"}</button>
              </div>
              <div className="settings-info-row">
                <div><strong>Free model catalogue</strong><small>{modelsLoading ? "Refreshing model list…" : freeModels.length + " zero-priced models listed."}</small></div>
                <button className="secondary-button compact-button" onClick={() => { setModelsLoading(true); fetch("https://openrouter.ai/api/v1/models?filter=free").then((response) => response.json()).then((payload: { data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }> }) => { const models = (payload.data ?? []).filter((model) => model.id && model.id.endsWith(":free") && Number(model.pricing?.prompt ?? 1) === 0 && Number(model.pricing?.completion ?? 1) === 0).map((model) => ({ id: model.id!, name: (model.name || model.id!) + " (free)" })).sort((a, b) => a.name.localeCompare(b.name)); if (models.length) setFreeModels(models); }).catch(() => notify("Could not refresh free models; keeping the last loaded list.")).finally(() => setModelsLoading(false)); }}>Refresh models</button>
              </div>
            </div></>}
            <div className="connector-row"><span className="connector-icon"><Zap size={17} /></span><div><strong>Supabase</strong><small>{demoMode ? "Cloud storage is bypassed in this session." : "Database and authentication for this workspace."}</small></div>{demoMode ? <span className="setting-pill">Demo only</span> : <button className="connector-action enabled" disabled><Check size={13} /> Connected</button>}</div>
          </>}{activeSettings === "Automation & limits" && <><h2>Automation & usage limits</h2><p className="settings-intro">Control autonomous work, the approval gate and usage limits. Background agents run while this workspace is open and connected.</p><div className="setting-toggle-row"><div><strong>Always-on team collaboration</strong><small>{demoMode ? "Demo mode does not make external AI calls." : !settings.autoRun ? "Agents are paused. Turn this on to run eligible jobs and coordinate around active work." : !openRouterKey.trim() ? "Enabled, but waiting for an OpenRouter API key in Settings → Connectors." : !settings.connectors.includes("OpenRouter") ? "Enabled, but OpenRouter is disabled in Connectors." : "Agents are monitoring in-progress jobs and periodically coordinating in the Team collaboration chat."}</small></div><button className={"toggle " + (settings.autoRun ? "on" : "")} role="switch" aria-checked={settings.autoRun} aria-label="Always-on team collaboration" onClick={() => setSettings((old) => ({ ...old, autoRun: !old.autoRun }))}><span /></button></div><div className="setting-toggle-row"><div><strong>Require approval before jobs start</strong><small>{settings.approvalRequired ? "New assignments wait in the queue until you start them. Running jobs can still receive background assistance." : "New assignments start immediately and are picked up by the background team when a provider is configured."}</small></div><button className={"toggle " + (settings.approvalRequired ? "on" : "")} role="switch" aria-checked={settings.approvalRequired} aria-label="Require approval before jobs start" onClick={() => setSettings((old) => ({ ...old, approvalRequired: !old.approvalRequired }))}><span /></button></div><label className="field-label">Daily job creation limit<input type="number" min="1" max="10000" value={settings.dailyLimit} onChange={(e) => setSettings({ ...settings, dailyLimit: Math.max(1, Number(e.target.value)) })} /></label><label className="field-label">Monthly job creation limit<input type="number" min="1" max="100000" value={settings.monthlyLimit} onChange={(e) => setSettings({ ...settings, monthlyLimit: Math.max(1, Number(e.target.value)) })} /></label><div className="usage-summary"><div className="usage-summary-top"><span>Deliverables with results</span><strong>{jobs.filter((j) => Boolean(j.result?.trim())).length} / {jobs.length}</strong></div><div className="usage-track"><span style={{ width: (jobs.length ? jobs.filter((j) => Boolean(j.result?.trim())).length / jobs.length * 100 : 0) + "%" }} /></div></div><p className="small-disclaimer">Provider token usage and billing are not exposed by the current browser AI integration. These figures count saved deliverables, not billable tokens.</p></>}
        </section></div></div>}
      </main>
    </div>
    {mobileContextOpen && <button type="button" className="sidebar-scrim" aria-label="Close contextual navigation" onClick={() => setMobileContextOpen(false)} />}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
    {showHelp && <div className="modal-backdrop" onClick={() => setShowHelp(false)}><section className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close help">×</button><span className="modal-kicker"><CircleHelp size={14} /> QUICK GUIDE</span><h2 id="help-modal-title">How AutoBusiness works</h2><div className="help-step"><strong>1. Talk to your team</strong><p>Private and group conversations share relevant workspace chat and assignment context with participating employees.</p></div><div className="help-step"><strong>2. Delegate meaningful work</strong><p>Employees can choose to reply or open an assignment. New assignments appear in Jobs & approvals.</p></div><div className="help-step"><strong>3. Review before approving</strong><p>Open submitted work, request a revision with feedback, or approve it to complete the job.</p></div><div className="help-step"><strong>4. Configure access carefully</strong><p>Provider keys are stored in this browser. Autonomous agents require an OpenRouter key and run while the authenticated workspace remains open; they pause when the page is closed. True server-side 24/7 operation needs a separately deployed background worker.</p></div><div className="work-modal-actions"><button className="primary-button" onClick={() => setShowHelp(false)}>Got it</button><button className="secondary-button" onClick={() => { setShowHelp(false); changePage("Settings"); }}>Open settings</button></div></section></div>}
    {profileEmployeeId && (() => { const person = employeeMap.get(profileEmployeeId); if (!person) return null; return <div className="modal-backdrop" onClick={() => setProfileEmployeeId(null)}><section className="modal employee-quick-profile" role="dialog" aria-modal="true" aria-labelledby="quick-profile-title" onClick={(e) => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setProfileEmployeeId(null)} aria-label="Close employee profile">×</button><div className="employee-profile-head"><div className="avatar large">{initials(person.name)}</div><div className="employee-profile-title"><h2 id="quick-profile-title">{person.name}</h2><p>{person.role}</p><span className={"presence " + person.status.toLowerCase().replace(" ", "-")}><i />{person.status}</span></div></div><div className="detail-divider" /><div className="detail-section-title">DEPARTMENT</div><p className="profile-value">{departmentPath(person.deptId)}</p><div className="detail-section-title">REPORTING LINE</div><p className="profile-value">Reports to {managerNameFor(person.managerId)}</p>{employees.filter((employee) => employee.managerId === person.id).length > 0 && <><div className="detail-section-title">DIRECT REPORTS</div>{employees.filter((employee) => employee.managerId === person.id).map((employee) => <button className="profile-report-row" key={employee.id} onClick={() => setProfileEmployeeId(employee.id)}><span className="avatar tiny">{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.role}</small></span><ChevronRight size={14} /></button>)}</>}<div className="detail-section-title">CURRENT WORK</div><p className="profile-value">{person.task || "No active task"}</p><div className="detail-section-title">OPEN JOBS</div>{jobs.filter((j) => j.employeeId === person.id && ["Queued", "In progress", "Submitted"].includes(j.status)).map((j) => <div className="employee-job-mini" key={j.id}><span className="employee-job-copy"><strong>{j.title}</strong><small>{j.status}</small></span></div>)}{!jobs.some((j) => j.employeeId === person.id && ["Queued", "In progress", "Submitted"].includes(j.status)) && <p className="profile-value">No open jobs.</p>}<div className="work-modal-actions"><button className="secondary-button" onClick={() => setProfileEmployeeId(null)}>Close</button><button className="primary-button" onClick={() => { setProfileEmployeeId(null); setSelectedEmployee(person.id); setPage("Management"); }}><Users size={14} /> Open full profile</button><button className="secondary-button" onClick={() => { setProfileEmployeeId(null); setPage("Communication"); setMobileContextOpen(false); void openChatWith(person.id); }}>Open chat</button></div></section></div>; })()}
    {selectedJobId && (() => { const j = jobs.find((item) => item.id === selectedJobId); if (!j) return null; const emp = employeeMap.get(j.employeeId); return <div className="review-page-backdrop" onClick={() => setSelectedJobId(null)}><section className="review-page" role="dialog" aria-modal="true" aria-labelledby="work-modal-title" onClick={(e) => e.stopPropagation()}><header className="review-page-header"><div><span className="modal-kicker"><Inbox size={14} /> DELIVERABLE REVIEW</span><h1 id="work-modal-title">{j.title}</h1><p>Assigned to {emp?.name ?? "Unassigned"} · {j.status} · {j.priority}{j.submittedAt ? " · Submitted " + new Date(j.submittedAt).toLocaleString() : ""}</p></div><button type="button" className="review-close-button" onClick={() => setSelectedJobId(null)} aria-label="Close work review">×</button></header><div className="review-page-scroll"><div className="review-layout"><main className="review-document"><div className="review-document-top"><span>DOCUMENT PREVIEW</span><span>Markdown</span></div>{j.description && <div className="work-job-brief"><strong>Job brief</strong><p>{j.description}</p></div>}{j.status === "Rejected" && j.reviewNote && <div className="review-feedback"><strong>Requested changes</strong><p>{j.reviewNote}</p></div>}<article className="work-result">{j.result?.trim() ? <MarkdownPreview content={j.result} /> : <p>No deliverable has been generated yet. Start the job and generate work before reviewing or approving it.</p>}</article></main><aside className="review-sidebar"><h2>Review details</h2><div className="review-side-row"><span>Owner</span><strong>{emp?.name ?? "Unassigned"}</strong></div><div className="review-side-row"><span>Status</span><strong>{j.status}</strong></div><div className="review-side-row"><span>Priority</span><strong>{j.priority}</strong></div><div className="review-side-row"><span>Created</span><strong>{new Date(j.created).toLocaleDateString()}</strong></div>{j.status === "Submitted" && <label className="review-note-field">Revision feedback (required to send back)<textarea rows={5} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Explain what needs to change, with specific, actionable feedback." /></label>}{j.status === "Rejected" && <label className="review-note-field">Update revision feedback<textarea rows={5} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="What should the employee change?" /></label>}</aside></div></div><footer className="review-page-footer"><button className="secondary-button" onClick={() => setSelectedJobId(null)}>Close</button>{j.status === "In progress" && <button className="primary-button" disabled={busy} onClick={() => void runJob(j.id)}>{busy ? "Generating…" : "Generate work"}</button>}{j.status === "Rejected" && <button className="primary-button" disabled={busy} onClick={() => { setJobs((old) => old.map((x) => x.id === j.id ? { ...x, status: "In progress", reviewNote: reviewNote.trim() || x.reviewNote } : x)); void runJob(j.id, reviewNote.trim() || j.reviewNote); }}>{busy ? "Generating…" : "Regenerate work"}</button>}{j.status === "Submitted" && <><button className="secondary-button" onClick={() => requestRevision(j.id)}>Request revision</button><button className="primary-button" disabled={!j.result?.trim()} onClick={() => { if (j.result?.trim()) { approveJob(j.id); setSelectedJobId(null); } }}><Check size={14} /> Approve reviewed work</button></>}</footer></section></div>; })()}
    {showJobForm && <div className="modal-backdrop" onClick={() => setShowJobForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createJob}><button type="button" className="modal-close" onClick={() => setShowJobForm(false)}>×</button><span className="modal-kicker"><Inbox size={14} /> JOB ASSIGNMENT</span><h2>Assign a job</h2><p>Give an employee a clear outcome to work towards.</p><label>Job title<input autoFocus value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Draft a launch plan" minLength={2} maxLength={240} required /></label><label>Job brief / acceptance criteria<textarea rows={4} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} maxLength={8000} placeholder="Describe the expected deliverable, audience, constraints, and what a successful result includes." /></label><label>Priority<select value={jobPriority} onChange={(e) => setJobPriority(e.target.value as "Normal" | "Urgent")}><option>Normal</option><option>Urgent</option></select></label><label>Assign to<select value={jobEmployee} onChange={(e) => setJobEmployee(e.target.value)}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}</select></label><div className="modal-note"><ShieldCheck size={15} />{settings.approvalRequired ? "This job will be queued for approval before it can start." : "This job will start without the approval gate; AI generation still requires a manual action."}</div><button className="primary-button modal-submit" type="submit">Create job <ArrowUpRight size={15} /></button></form></div>}
    {showEmployeeForm && <div className="modal-backdrop" onClick={() => setShowEmployeeForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createEmployee}><button type="button" className="modal-close" onClick={() => setShowEmployeeForm(false)}>×</button><span className="modal-kicker"><Users size={14} /> TEAM SETUP</span><h2>Add an employee</h2><p>Create a new AI teammate for this workspace.</p><label>Full name<input autoFocus value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="e.g. Sam Taylor" required /></label><label>Role<input value={employeeRole} onChange={(e) => setEmployeeRole(e.target.value)} placeholder="e.g. Research analyst" required /></label><label>Department<select value={newEmployeeDept} onChange={(e) => setNewEmployeeDept(e.target.value)} required><option value="" disabled>Select a department</option>{depts.map((d) => <option key={d.id} value={d.id}>{departmentPath(d.id)}</option>)}</select></label><label>Reports to<select value={newEmployeeManager} onChange={(e) => setNewEmployeeManager(e.target.value)} required><option value="" disabled>Choose a manager</option><option value="__none__">You · top of hierarchy</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.role}</option>)}</select><small className="input-help">This determines their manager and reporting line.</small></label><button className="primary-button modal-submit" type="submit">Create employee <Plus size={15} /></button></form></div>}
    {showDepartmentForm && <div className="modal-backdrop" onClick={() => setShowDepartmentForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createDepartment}><button type="button" className="modal-close" onClick={() => setShowDepartmentForm(false)} aria-label="Close department form">×</button><span className="modal-kicker"><Building2 size={14} /> ORGANISATION DESIGN</span><h2>Add a department</h2><p>Create a top-level department or place it under another department to build any number of nested levels.</p><label>Department name<input autoFocus value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="e.g. Research" minLength={1} maxLength={100} required /></label><label>Parent department<select value={newDepartmentParent} onChange={(e) => setNewDepartmentParent(e.target.value)}><option value="__root__">No parent · top-level department</option>{depts.map((department) => <option key={department.id} value={department.id}>{departmentPath(department.id)}</option>)}</select></label><button className="primary-button modal-submit" type="submit">Create department <Plus size={15} /></button></form></div>}
    {showInviteForm && <div className="modal-backdrop" onClick={() => setShowInviteForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createInvite}><button type="button" className="modal-close" onClick={() => setShowInviteForm(false)} aria-label="Close invitation form">×</button><span className="modal-kicker"><Users size={14} /> TEAM ACCESS</span><h2>Invite a teammate</h2><p>Only the invited email address can redeem this link. It expires after seven days.</p><label>Email address<input autoFocus type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" required disabled={Boolean(inviteUrl)} /></label><label>Workspace role<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")} disabled={Boolean(inviteUrl)}><option value="member">Member — collaborate on work</option><option value="admin">Admin — manage workspace settings</option></select></label>{inviteUrl && <div className="invite-link-result"><strong>Invitation link ready</strong><p>Send this link to the invited person. They must sign in with the exact email address above.</p><input aria-label="Invitation link" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} /><button type="button" className="secondary-button" onClick={() => { void navigator.clipboard.writeText(inviteUrl).then(() => notify("Invitation link copied")).catch(() => notify("Select the invitation link and copy it manually")); }}>Copy invitation link</button><button type="button" className="text-button" onClick={() => { setInviteUrl(""); setInviteEmail(""); }}>Create another invitation</button></div>}<div className="work-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowInviteForm(false)}>Close</button>{!inviteUrl && <button className="primary-button" type="submit" disabled={inviteBusy}>{inviteBusy ? "Creating link…" : "Create invitation link"}</button>}</div></form></div>}
    {showGoalForm && <div className="modal-backdrop" onClick={() => setShowGoalForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createGoal}><button type="button" className="modal-close" onClick={() => setShowGoalForm(false)} aria-label="Close goal form">×</button><span className="modal-kicker"><Activity size={14} /> GOAL TRACKING</span><h2>Create a goal</h2><p>Set a measurable outcome for this company.</p><label>Goal title<input autoFocus value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="e.g. Improve onboarding completion" minLength={2} maxLength={180} required /></label><label>Description<textarea rows={3} value={goalDescription} onChange={(e) => setGoalDescription(e.target.value)} maxLength={4000} placeholder="Describe the outcome and how you will measure it." /></label><label>Due date<input type="date" value={goalDueDate} onChange={(e) => setGoalDueDate(e.target.value)} /></label><button className="primary-button modal-submit" type="submit">Create goal <Plus size={15} /></button></form></div>}
    {showChatForm && <div className="modal-backdrop" onClick={() => setShowChatForm(false)}><form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createConversation}><button type="button" className="modal-close" onClick={() => setShowChatForm(false)}>×</button><span className="modal-kicker"><MessageCircle size={14} /> COMMUNICATION</span><h2>New conversation</h2><p>Start a private chat or bring a few employees together.</p><label>Conversation name<input autoFocus value={newChatName} onChange={(e) => setNewChatName(e.target.value)} placeholder="e.g. Website launch" required /></label><label>Invite employees<select multiple value={newChatMembers} onChange={(e) => setNewChatMembers(Array.from(e.target.selectedOptions, (o) => o.value))}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}</select><small className="input-help">Choose one employee for a private chat, or several for a group.</small></label><button className="primary-button modal-submit" type="submit">Create conversation <ArrowUpRight size={15} /></button></form></div>}
  </div>;
}
