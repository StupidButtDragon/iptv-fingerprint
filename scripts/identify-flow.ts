/**
 * Full in-browser Identify flow test:
 *   1. spawns the mock Xtream provider (scripts/mock-xtream.py) on a local port
 *   2. opens the preview's Identify page and submits the form like a user
 *   3. waits for the job console + auto-navigation to the scan detail page
 *   4. asserts the scan detail shows a T-Rex MATCH verdict
 *   5. cleans up: deletes the test scan and stops the mock server
 *
 * Usage: bun scripts/identify-flow.ts [baseUrl] [port]
 * Exits non-zero on any failure.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "https://5173-ij4ge07sk6efgg0e8mdec.e2b.app").replace(/\/$/, "");
const PORT = Number(process.argv[3] ?? 8091);
const SCAN = "ui-flow-test";

const problems: string[] = [];
const steps: string[] = [];
const step = (m: string) => {
  steps.push(m);
  console.log(`· ${m}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let mock: ChildProcess | null = null;
function stopMock() {
  if (mock?.pid) {
    try {
      mock.kill("SIGKILL");
    } catch {
      /* already dead */
    }
  }
  mock = null;
}

try {
  // 1. Mock provider --------------------------------------------------
  mock = spawn("python3", ["scripts/mock-xtream.py", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  mock.stderr?.on("data", (d) => problems.push(`mock stderr: ${String(d).slice(0, 200)}`));

  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/player_api.php?username=demo&password=demo`);
      const body = (await res.json()) as { user_info?: { auth?: number } };
      ready = body.user_info?.auth === 1;
    } catch {
      await sleep(250);
    }
  }
  if (!ready) throw new Error(`mock xtream did not become ready on port ${PORT}`);
  step(`mock xtream ready on 127.0.0.1:${PORT}`);

  // 2. Submit the form like a user -------------------------------------
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => problems.push(`pageerror: ${String(err).slice(0, 300)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error: ${msg.text().slice(0, 300)}`);
  });

  await page.goto(`${BASE}/#/app`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByLabel("Scan name").fill(SCAN);
  await page.getByLabel("Server URL").fill(`http://127.0.0.1:${PORT}`);
  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill("demo");
  step("form filled");

  await page.getByRole("button", { name: "Run", exact: true }).click();
  step("Run clicked — waiting for job to finish and redirect…");

  // The Identify page navigates to the scan detail when the job reports done.
  await page.waitForURL(
    (u) => u.hash.includes(`/app/scans/${encodeURIComponent(SCAN)}`),
    { timeout: 150_000 },
  );
  step(`navigated to ${page.url()}`);

  // 3. Verify the scan detail ------------------------------------------
  await page.waitForTimeout(3000); // let the detail queries settle
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  if (!text.includes(SCAN)) problems.push("scan detail: scan name not shown");
  if (!/T-Rex/i.test(text)) problems.push("scan detail: T-Rex match not shown");
  if (!/\bMATCH\b/i.test(text)) problems.push("scan detail: MATCH verdict not shown");
  if (!/2,?000|2000/.test(text)) problems.push("scan detail: expected ~2000 channels in stats");
  await page.screenshot({ path: "scripts/shots/identify-flow.png", fullPage: false });
  const idx = text.search(/T-Rex/i);
  steps.push(`detail excerpt: ${text.slice(Math.max(0, idx - 80), idx + 160)}`);

  await browser.close();

  // 4. Cleanup ----------------------------------------------------------
  const del = spawnSync(
    "bunx",
    ["convex", "run", "scans:deleteScan", JSON.stringify({ name: SCAN })],
    { encoding: "utf-8", timeout: 60_000 },
  );
  if (del.status === 0) step(`cleanup: deleted scan "${SCAN}"`);
  else problems.push(`cleanup failed (exit ${del.status}): ${(del.stderr || del.stdout || "").slice(0, 300)}`);
} catch (err) {
  problems.push(`fatal: ${String(err).slice(0, 500)}`);
} finally {
  stopMock();
}

console.log("=== STEPS ===");
for (const s of steps) console.log(s);
console.log("=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "(none)");
if (problems.length) process.exit(1);
