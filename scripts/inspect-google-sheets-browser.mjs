import { chromium } from "playwright-core";

const baseURL = process.env.SHEETS_E2E_BASE_URL || "https://vocabulary-exam.vercel.app";
const username = process.env.SHEETS_E2E_USERNAME;
const password = process.env.SHEETS_E2E_PASSWORD;
if (!username || !password) throw new Error("Set SHEETS_E2E_USERNAME and SHEETS_E2E_PASSWORD for the authorized test account.");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const context = await browser.newContext({ baseURL });
  const login = await context.request.post("/api/auth/login", { data: { username, password } });
  if (!login.ok()) throw new Error(`Login failed: ${login.status()}`);
  const page = await context.newPage();
  const blockedSyncRequests = [];
  await page.route("**/api/admin/google-sheets/connections/*/sync", async route => {
    if (route.request().method() === "POST") {
      blockedSyncRequests.push(route.request().url());
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Read-only browser inspection: sync blocked" }) });
    } else await route.continue();
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin/sets", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const setName = process.env.SHEETS_E2E_SET_NAME || "02_TestSheetAII";
  const setLabel = page.getByText(setName, { exact: true }).first();
  const card = setLabel.locator('xpath=ancestor::div[.//button[normalize-space()="Quản lý bộ từ"]][1]');
  await card.getByRole("button", { name: "Quản lý bộ từ", exact: true }).click();
  await page.getByRole("button", { name: "Quản lý từ vựng", exact: true }).click();
  await page.waitForTimeout(5000);
  console.log(JSON.stringify({ title: await page.title(), url: page.url(), errors, blockedSyncRequests, visibleText: (await page.getByRole("dialog").innerText()).slice(0, 7000) }, null, 2));
  const response = await context.request.get("/api/admin/google-sheets/connections?setId=292");
  const result = await response.json();
  console.log(JSON.stringify({ connectionStatus: response.status(), connections: result.connections?.map(item => ({ id: item.id, setId: item.setId, status: item.status, enabled: item.enabled, lastSyncedAt: item.lastSyncedAt, channelExpiresAt: item.channelExpiresAt })) }, null, 2));
} finally { await browser.close(); }
