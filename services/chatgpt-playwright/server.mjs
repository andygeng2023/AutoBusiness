import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 8787);
const STATE_PATH = process.env.CHATGPT_STORAGE_STATE || "/data/chatgpt-auth.json";
const CHATGPT_URL = process.env.CHATGPT_URL || "https://chatgpt.com/";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ALLOWED_ORIGINS = new Set(
  (process.env.APP_ORIGINS || "https://andygeng2023.github.io,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map(value => value.trim()).filter(Boolean)
);
const MAX_BODY = 120_000;
let browserContext;
let requestQueue = Promise.resolve();

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(payload));
}
async function validateSupabaseSession(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Worker authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  const authorization = req.headers.authorization || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return false;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(10_000)
  });
  return response.ok;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "", size = 0;
    req.on("data", chunk => { size += chunk.length; if (size > MAX_BODY) { reject(new Error("Request body too large.")); req.destroy(); return; } body += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Request body must be valid JSON.")); } });
    req.on("error", reject);
  });
}
function normaliseMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 100) throw new Error("Between 1 and 100 messages are required.");
  return messages.map((m) => {
    if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 50_000) throw new Error("Messages must contain supported roles and text content under 50,000 characters.");
    return { role: m.role, content: m.content };
  });
}
function transcript(messages) {
  return messages.map((m) => {
    const label = m.role === "system" ? "COMPANY AND EMPLOYEE INSTRUCTIONS" : m.role === "assistant" ? "EMPLOYEE'S PREVIOUS RESPONSE" : "USER / WORKSPACE MESSAGE";
    return "[" + label + "]\n" + m.content;
  }).join("\n\n---\n\n") + "\n\nRespond as the assigned employee. Follow the instructions and conversation context above. Do not claim to have performed external actions.";
}
async function getContext() {
  if (browserContext) return browserContext;
  if (!fs.existsSync(STATE_PATH)) throw new Error("ChatGPT browser session is not configured. Run the login setup and mount CHATGPT_STORAGE_STATE at " + STATE_PATH + ".");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  browserContext = await browser.newContext({ storageState: STATE_PATH, viewport: { width: 1440, height: 1000 } });
  browserContext.on("close", () => browser.close());
  return browserContext;
}
async function runChatGPT(messages) {
  const context = await getContext();
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  try {
    await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const composer = page.locator("#prompt-textarea, [contenteditable='true'][data-testid='prompt-textarea'], [contenteditable='true'][role='textbox'], textarea").last();
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill(transcript(messages));
    const send = page.getByRole("button", { name: /send/i }).last();
    if (await send.count()) await send.click();
    else await composer.press("Enter");
    const assistant = page.locator('[data-message-author-role="assistant"]').last();
    await assistant.waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForFunction(() => {
      const stop = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
      return messages.length > 0 && !stop;
    }, null, { timeout: 120_000 }).catch(() => {});
    const answer = (await assistant.innerText()).trim();
    if (!answer) throw new Error("ChatGPT returned an empty response.");
    return answer;
  } finally {
    await page.close().catch(() => {});
    await context.storageState({ path: STATE_PATH }).catch((error) => console.error("Could not refresh stored ChatGPT session:", error?.message || error));
  }
}
function sse(res, text) {
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "connection": "keep-alive", "x-accel-buffering": "no" });
  const id = "chatcmpl-" + crypto.randomUUID();
  const chunk = { id, object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "chatgpt-web", choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] };
  res.write("data: " + JSON.stringify(chunk) + "\n\n");
  res.write("data: " + JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "chatgpt-web", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\n");
  res.end("data: [DONE]\n\n");
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (req.url === "/health" && req.method === "GET") {
    return json(res, 200, { ok: true, provider: "chatgpt-playwright", sessionConfigured: fs.existsSync(STATE_PATH) });
  }
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: { message: "Origin is not allowed." } });
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }
  if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
    return json(res, 404, { error: { message: "Not found." } }, corsHeaders(origin));
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(res, 403, { error: { message: "Origin is not allowed." } });
  }
  try {
    if (!(await validateSupabaseSession(req))) {
      return json(res, 401, { error: { message: "Your AutoBusiness sign-in session is invalid or expired." } }, corsHeaders(origin));
    }
  } catch (error) {
    console.error("Supabase session validation failed:", error?.message || error);
    return json(res, 503, { error: { message: error?.message || "Could not validate your AutoBusiness session." } }, corsHeaders(origin));
  }
  let payload;
  try { payload = await readBody(req); } catch (error) {
    return json(res, 400, { error: { message: error.message } }, corsHeaders(origin));
  }
  let messages;
  try { messages = normaliseMessages(payload.messages); } catch (error) {
    return json(res, 400, { error: { message: error.message } }, corsHeaders(origin));
  }
  const task = requestQueue.then(() => runChatGPT(messages));
  requestQueue = task.catch(() => {});
  try {
    const answer = await task;
    const headers = corsHeaders(origin);
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "connection": "keep-alive", "x-accel-buffering": "no", ...headers });
    const id = "chatcmpl-" + crypto.randomUUID();
    const chunk = { id, object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "chatgpt-web", choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] };
    res.write("data: " + JSON.stringify(chunk) + "\n\n");
    res.write("data: " + JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model: "chatgpt-web", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\n");
    res.end("data: [DONE]\n\n");
  } catch (error) {
    console.error("ChatGPT Playwright request failed:", error?.message || error);
    json(res, 502, { error: { message: error?.message || "ChatGPT browser request failed." } }, corsHeaders(origin));
  }
});
server.listen(PORT, "0.0.0.0", () => console.log("AutoBusiness ChatGPT Playwright worker listening on " + PORT));
