const DEFAULT_ORIGINS = [
  "https://andygeng2023.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const ALLOWED_MODELS = new Set([
  "glm-5.3-flash",
  "deepseek-v4-flash",
  "minimax-m3",
  "qwen3.6-35b",
]);
const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const jsonError = (message: string, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const configured = (Deno.env.get("APP_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const origins = new Set([...DEFAULT_ORIGINS, ...configured]);

  if (req.method === "OPTIONS") {
    if (!origins.has(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);
  if (!origins.has(origin)) return jsonError("Origin is not allowed.", 403, corsHeaders(origin));

  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return jsonError("A signed-in session is required.", 401, corsHeaders(origin));
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const providerKey = Deno.env.get("FREEINFERENCE_API_KEY");
  if (!supabaseUrl || !anonKey) {
    return jsonError("Supabase authentication is not configured for this function.", 503, corsHeaders(origin));
  }
  if (!providerKey) {
    return jsonError("FreeInference is not configured yet. Add FREEINFERENCE_API_KEY under Supabase Edge Function secrets.", 503, corsHeaders(origin));
  }

  const authCheck = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: { "Authorization": authorization, "apikey": anonKey },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!authCheck?.ok) {
    return jsonError("Your sign-in session is invalid or expired.", 401, corsHeaders(origin));
  }

  let payload: { model?: unknown; messages?: unknown; temperature?: unknown; max_tokens?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400, corsHeaders(origin));
  }
  if (typeof payload.model !== "string" || !ALLOWED_MODELS.has(payload.model)) {
    return jsonError("Choose a model available on the FreeInference free catalogue.", 400, corsHeaders(origin));
  }
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 100) {
    return jsonError("Between 1 and 100 messages are required.", 400, corsHeaders(origin));
  }
  const messages = payload.messages as Array<{ role?: unknown; content?: unknown }>;
  if (messages.some((message) =>
    !message || !["system", "user", "assistant"].includes(String(message.role)) ||
    typeof message.content !== "string" || message.content.length > 50000
  )) {
    return jsonError("Each message must have a supported role and text content under 50,000 characters.", 400, corsHeaders(origin));
  }

  const requestBody: Record<string, unknown> = {
    model: payload.model,
    messages,
    stream: true,
    temperature: typeof payload.temperature === "number"
      ? Math.max(0, Math.min(2, payload.temperature))
      : 0.4,
  };
  if (typeof payload.max_tokens === "number" && Number.isInteger(payload.max_tokens)) {
    requestBody.max_tokens = Math.max(1, Math.min(100000, payload.max_tokens));
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://freeinference.org/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + providerKey,
        "Content-Type": "application/json",
        "X-Reasoning-Passthrough": "false",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "NetworkError";
    console.error("FreeInference upstream connection failed", {
      name,
      region: Deno.env.get("SB_REGION") ?? "unknown",
    });
    return jsonError(
      name === "TimeoutError"
        ? "FreeInference did not respond within 180 seconds. Try again."
        : "Could not connect to FreeInference. Check the Supabase function logs.",
      502,
      corsHeaders(origin),
    );
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    let message = "FreeInference rejected the request.";
    try {
      const parsed = JSON.parse(body);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      if (body) message = body.slice(0, 500);
    }
    const headers = new Headers(corsHeaders(origin));
    if (upstream.headers.has("Retry-After")) headers.set("Retry-After", upstream.headers.get("Retry-After")!);
    return jsonError(message, upstream.status, headers);
  }

  const headers = new Headers(corsHeaders(origin));
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  return new Response(upstream.body, { status: 200, headers });
});
