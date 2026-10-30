const DEFAULT_ORIGINS = ["https://andygeng2023.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];
const cors = (origin: string) => ({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const errorResponse = (message: string, status: number, headers: HeadersInit = {}) => new Response(JSON.stringify({ error: { message } }), { status, headers: { "Content-Type": "application/json", ...headers } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const configured = (Deno.env.get("APP_ORIGINS") ?? "").split(",").map(v => v.trim()).filter(Boolean);
  const origins = new Set([...DEFAULT_ORIGINS, ...configured]);
  if (req.method === "OPTIONS") return origins.has(origin) ? new Response("ok", { headers: cors(origin) }) : new Response(null, { status: 403 });
  if (req.method !== "POST") return errorResponse("Method not allowed.", 405);
  if (!origins.has(origin)) return errorResponse("Origin is not allowed.", 403, cors(origin));
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return errorResponse("A signed-in session is required.", 401, cors(origin));
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceUrl = Deno.env.get("PLAYWRIGHT_SERVICE_URL");
  const serviceToken = Deno.env.get("PLAYWRIGHT_SERVICE_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceUrl || !serviceToken) return errorResponse("ChatGPT Playwright service is not configured. Set PLAYWRIGHT_SERVICE_URL and PLAYWRIGHT_SERVICE_TOKEN in Supabase function secrets.", 503, cors(origin));
  const authCheck = await fetch(supabaseUrl + "/auth/v1/user", { headers: { "Authorization": authorization, "apikey": anonKey } });
  if (!authCheck.ok) return errorResponse("Your sign-in session is invalid or expired.", 401, cors(origin));
  let payload: { messages?: unknown };
  try { payload = await req.json(); } catch { return errorResponse("Request body must be valid JSON.", 400, cors(origin)); }
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 100) return errorResponse("Between 1 and 100 messages are required.", 400, cors(origin));
  if (payload.messages.some((m: any) => !m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 50000)) return errorResponse("Each message must have a supported role and text content under 50,000 characters.", 400, cors(origin));
  let upstream: Response;
  try {
    upstream = await fetch(serviceUrl.replace(/\/$/, "") + "/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + serviceToken, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "chatgpt-web", messages: payload.messages }),
      signal: AbortSignal.timeout(180000)
    });
  } catch (error) {
    console.error("Playwright worker connection failed", error instanceof Error ? error.message : String(error));
    return errorResponse("Could not connect to the ChatGPT Playwright worker. Check its deployment and health endpoint.", 502, cors(origin));
  }
  if (!upstream.ok) {
    const detail = await upstream.json().catch(() => ({}));
    return errorResponse(detail?.error?.message || "ChatGPT Playwright worker rejected the request.", upstream.status, cors(origin));
  }
  const headers = new Headers(cors(origin));
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  return new Response(upstream.body, { status: 200, headers });
});
