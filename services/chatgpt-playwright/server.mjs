import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 8787);
const ACCESS_TOKEN = process.env.PLAYWRIGHT_SERVICE_TOKEN || "";
const STATE_PATH = process.env.CHATGPT_STORAGE_STATE || "/data/chatgpt-auth.json";
const CHATGPT_URL = process.env.CHATGPT_URL || "https://chatgpt.com/";
const MAX_BODY = 120_000;
let browserContext;
let requestQueue = Promise.resolve();

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
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
  browserContext = await chromium.launchPersistentContext(path.dirname(STATE_PATH), {
    headless: true,
    channel: "chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    viewport: { width: 1440, height: 1000 }
  }).catch(async () => {
    // Persistent profile is preferred; if the mounted path is a storage-state file,
    // use an isolated context loaded from that authenticated state instead.
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const context = await browser.newContext({ storageState: STATE_PATH, viewport: { width: 1440, height: 1000 } });
    context.on("close", () => browser.close());
    return context;
  });
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
  if (req.url === "/health" && req.method === "GET") return json(res, 200, { ok: true, provider: "chatgpt-playwright", authenticatedStatePresent: fs.existsSync(STATE_PATH) });
  if (req.url !== "/v1/chat/completions" || req.method !== "POST") return json(res, 404, { error: { message: "Not found." } });
  if (!ACCESS_TOKEN || req.headers.authorization !== "Bearer " + ACCESS_TOKEN) return json(res, 401, { error: { message: "Unauthorized." } });
  let payload;
  try { payload = await readBody(req); } catch (error) { return json(res, 400, { error: { message: error.message } }); }
  let messages;
  try { messages = normaliseMessages(payload.messages); } catch (error) { return json(res, 400, { error: { message: error.message } }); }
  const task = requestQueue.then(() => runChatGPT(messages));
  requestQueue = task.catch(() => {});
  try { const answer = await task; sse(res, answer); }
  catch (error) { console.error("ChatGPT Playwright request failed:", error?.message || error); json(res, 502, { error: { message: error?.message || "ChatGPT browser request failed." } }); }
});
server.listen(PORT, "0.0.0.0", () => console.log("AutoBusiness ChatGPT Playwright worker listening on " + PORT));
