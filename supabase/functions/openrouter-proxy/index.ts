const DEFAULT_ORIGINS = [
  "https://andygeng2023.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const RATE_LIMIT_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const cooldownUntil = new Map<string, number>();
let nextKeyIndex = 0;

const allowedOrigins = () => {
  const configured = (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
};
const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-title",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const jsonError = (message: string, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function configuredKeys(): string[] {
  const raw = Deno.env.get("OPENROUTER_API_KEYS") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if (!raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return [...new Set(parsed.filter((key): key is string => typeof key === "string").map((key) => key.trim()).filter(Boolean))];
  } catch {
    // A comma-separated secret is also supported for easier dashboard setup.
  }
  return [...new Set(raw.split(",").map((key) => key.trim()).filter(Boolean))];
}

function isSafeApiKey(key: string): boolean {
  // HTTP header values must be ASCII here. Reject whitespace, control characters,
  // and Unicode rather than allowing one malformed secret to break every request.
  return /^[\\x21-\\x7E]+$/.test(key);
}

function orderedKeys(keys: string[]): string[] {
  const now = Date.now();
  for (const [key, until] of cooldownUntil) if (until <= now) cooldownUntil.delete(key);
  const start = nextKeyIndex % keys.length;
  nextKeyIndex = (nextKeyIndex + 1) % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)].filter((key) => (cooldownUntil.get(key) ?? 0) <= now);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const origins = allowedOrigins();
  if (req.method === "OPTIONS") {
    if (!origins.has(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);
  if (!origins.has(origin)) return jsonError("Origin is not allowed.", 403);

  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) return jsonError("A signed-in session is required.", 401);

  let payload: { model?: unknown; messages?: unknown; temperature?: unknown; stream?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400, corsHeaders(origin));
  }
  if (typeof payload.model !== "string" || payload.model.length > 200 || !Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 100) {
    return jsonError("A valid model and between 1 and 100 messages are required.", 400, corsHeaders(origin));
  }
  const messages = payload.messages as Array<{ role?: unknown; content?: unknown }>;
  if (messages.some((message) =>
    !message || !["system", "user", "assistant"].includes(String(message.role)) ||
    typeof message.content !== "string" || message.content.length > 50000
  )) {
    return jsonError("Each message must have a supported role and text content under 50,000 characters.", 400, corsHeaders(origin));
  }

  const configured = configuredKeys();
  const keys = configured.filter(isSafeApiKey);
  if (!configured.length) return jsonError("The server-side OpenRouter key pool is not configured. Add OPENROUTER_API_KEYS to Supabase Edge Function secrets.", 503, corsHeaders(origin));
  if (!keys.length) {
    console.error("OpenRouter key pool contains no valid ASCII API keys", { configuredKeyCount: configured.length });
    return jsonError("The OpenRouter key pool contains invalid key formatting. Re-enter the keys as plain ASCII API keys in Supabase Edge Function secrets.", 503, corsHeaders(origin));
  }
  if (keys.length !== configured.length) {
    console.error("Ignored malformed OpenRouter keys", { configuredKeyCount: configured.length, usableKeyCount: keys.length });
  }

  const candidates = orderedKeys(keys);
  if (!candidates.length) {
    const earliest = Math.min(...keys.map((key) => cooldownUntil.get(key) ?? Date.now()));
    const retryAfter = Math.max(1, Math.ceil((earliest - Date.now()) / 1000));
    return jsonError("All configured OpenRouter keys are temporarily cooling down after rate limits.", 429, {
      ...corsHeaders(origin),
      "Retry-After": String(retryAfter),
    });
  }

  let lastRateLimitBody = "";
  for (const key of candidates) {
    let upstream: Response;
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": origin,
          "X-Title": "AutoBusiness",
        },
        body: JSON.stringify({
          model: payload.model,
          messages,
          temperature: typeof payload.temperature === "number" ? payload.temperature : 0.4,
          stream: true,
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error : new Error(String(error));
      const errorName = detail.name || "UnknownError";
      const errorMessage = detail.message || "No error message";
      // Log diagnostic metadata only. Never log the request, headers, or API key.
      console.error("OpenRouter upstream fetch failed", {
        errorName,
        errorMessage: errorMessage.slice(0, 300),
        model: payload.model,
        region: Deno.env.get("SB_REGION") ?? "unknown",
      });
      const timedOut = errorName === "TimeoutError" || errorName === "AbortError";
      return jsonError(
        timedOut
          ? "OpenRouter did not respond within 25 seconds. Try again."
          : `The proxy could not establish an OpenRouter connection (${errorName}). Check the Supabase function logs for the diagnostic detail.`,
        502,
        corsHeaders(origin),
      );
    }

    if (upstream.status === 429) {
      lastRateLimitBody = await upstream.text().catch(() => "");
      cooldownUntil.set(key, Date.now() + RATE_LIMIT_COOLDOWN_MS);
      continue;
    }

    const headers = new Headers(corsHeaders(origin));
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8");
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("X-Accel-Buffering", "no");
    if (upstream.headers.has("Retry-After")) headers.set("Retry-After", upstream.headers.get("Retry-After")!);
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const retryAt = Math.min(...keys.map((key) => cooldownUntil.get(key) ?? Date.now()));
  const retryAfter = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  const message = lastRateLimitBody ? "Every available key was rate-limited. Keys have been placed in a temporary cooldown." : "Every available key was rate-limited.";
  return jsonError(message, 429, { ...corsHeaders(origin), "Retry-After": String(retryAfter) });
});
