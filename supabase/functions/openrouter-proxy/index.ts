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

type KeyPoolSource = "OPENROUTER_API_KEYS" | "OPENROUTER_API_KEY" | "both" | "none";
type KeyPool = { keys: string[]; rawEntries: string[]; source: KeyPoolSource };

function normalizeApiKey(value: string): string {
  let key = value.replace(/^\uFEFF/, "").trim();
  // Accept common dashboard copy/paste formats without changing the token itself.
  key = key.replace(/^[-*]\s*/, "").trim();
  key = key.replace(/^["'`]+|["'`]+$/g, "").trim();
  key = key.replace(/^authorization\s*:\s*/i, "");
  key = key.replace(/^bearer\s*:?\s*/i, "");
  // API tokens never contain whitespace; this also removes wrapped lines and CRLF.
  return key.replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}

function parseKeyEntries(raw: string): string[] {
  if (!raw.trim()) return [];

  let entries: unknown[] | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed;
    else if (typeof parsed === "string") entries = parsed.split(/[,;\r\n]+/);
    else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { keys?: unknown }).keys)) {
      entries = (parsed as { keys: unknown[] }).keys;
    }
  } catch {
    // Plain text pools may be comma-, semicolon-, or newline-separated.
  }
  if (!entries) entries = raw.split(/[,;\r\n]+/);

  return entries
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function configuredKeys(): KeyPool {
  const plural = Deno.env.get("OPENROUTER_API_KEYS") ?? "";
  const singular = Deno.env.get("OPENROUTER_API_KEY") ?? "";

  // Read both settings. A stale or malformed plural pool must not mask a valid
  // singular key left from an earlier deployment/configuration.
  const pluralEntries = parseKeyEntries(plural);
  const singularEntries = parseKeyEntries(singular);
  const rawEntries = [...pluralEntries, ...singularEntries];
  const source: KeyPoolSource = pluralEntries.length && singularEntries.length
    ? "both"
    : pluralEntries.length
    ? "OPENROUTER_API_KEYS"
    : singularEntries.length
    ? "OPENROUTER_API_KEY"
    : "none";

  const keys = [...new Set(rawEntries.map(normalizeApiKey).filter(Boolean))];
  return { keys, rawEntries, source };
}

function isSafeApiKey(key: string): boolean {
  // Header values must be printable ASCII. Normalisation above removes copy/paste
  // wrappers and whitespace; any remaining non-ASCII/control characters are invalid.
  return /^[\x21-\x7E]+$/.test(key);
}

function keyPoolDiagnostics(entries: string[]) {
  return entries.map((entry, index) => {
    const token = normalizeApiKey(entry);
    return {
      slot: index + 1,
      originalLength: entry.length,
      normalizedLength: token.length,
      containedWhitespace: /[\s\u200B-\u200D\uFEFF]/.test(entry),
      containedNonAscii: /[^\x21-\x7E]/.test(entry),
      hadOuterQuotes: /^["'`].*["'`]$/.test(entry),
      hadBearerPrefix: /^(?:authorization\s*:\s*)?bearer\s+/i.test(entry),
      hasOpenRouterPrefix: /^sk-or-/i.test(token),
    };
  });
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

  const pool = configuredKeys();
  const normalized = pool.keys;
  const keys = normalized.filter(isSafeApiKey);
  if (!pool.rawEntries.length) {
    return jsonError("The server-side OpenRouter key pool is not configured. Add OPENROUTER_API_KEYS to Supabase Edge Function secrets.", 503, corsHeaders(origin));
  }
  if (!keys.length) {
    console.error("OpenRouter key pool rejected; safe formatting diagnostics only", {
      source: pool.source,
      configuredKeyCount: pool.rawEntries.length,
      diagnostics: keyPoolDiagnostics(pool.rawEntries),
    });
    return jsonError("The OpenRouter key pool contains no usable API keys. Use raw OpenRouter keys in a JSON array, or one key per line/comma; optional quotes and a leading Bearer prefix are accepted.", 503, corsHeaders(origin));
  }
  if (keys.length !== normalized.length) {
    console.error("Ignored malformed OpenRouter key entries", {
      source: pool.source,
      configuredKeyCount: normalized.length,
      usableKeyCount: keys.length,
      diagnostics: keyPoolDiagnostics(pool.rawEntries),
    });
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
      const upstreamHeaders = new Headers();
      upstreamHeaders.set("Authorization", "Bearer " + key);
      upstreamHeaders.set("Content-Type", "application/json");
      upstreamHeaders.set("HTTP-Referer", origin);
      upstreamHeaders.set("X-Title", "AutoBusiness");
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: upstreamHeaders,
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
