import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const output = process.env.CHATGPT_STORAGE_STATE || path.resolve(".auth/chatgpt-state.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
console.log("Sign in to ChatGPT in the opened browser. Complete any verification yourself.");
console.log("After the ChatGPT conversation screen appears, return to this terminal and press Enter.");
await new Promise(resolve => process.stdin.once("data", resolve));
await context.storageState({ path: output });
console.log("Authenticated browser state saved to " + output + ". Treat this file like a password; do not commit or share it.");
await browser.close();
