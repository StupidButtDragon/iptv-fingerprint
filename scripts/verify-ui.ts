/**
 * Real-browser UI audit.
 *
 * Usage:  bun scripts/verify-ui.ts [baseUrl]
 *   BASE_URL defaults to http://127.0.0.1:5173 (the Freebuff preview inside the sandbox).
 *
 * For every route it checks: the page rendered (substantial text), key copy is
 * present, Tailwind/theme styles applied (body background), no horizontal
 * overflow, and records console errors / page errors / failed requests.
 * Full-page screenshots land in SHOTS (default /tmp/ui-shots).
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const SHOTS = process.env.SHOTS ?? "/tmp/ui-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedReqs: string[] = [];
const sockets = new Set<string>();

type Row = { route: string; pass: boolean; notes: string[] };
const rows: Row[] = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
page.on("requestfailed", (r) => {
  const u = r.url();
  if (u.includes("favicon")) return;
  failedReqs.push(`${u.slice(0, 140)} :: ${r.failure()?.errorText}`);
});
page.on("websocket", (ws) => sockets.add(ws.url().slice(0, 140)));

async function audit(name: string, hash: string, expects: string[]) {
  const notes: string[] = [];
  let ok = true;
  try {
    await page.goto(`${BASE}/${hash}`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(1800);
    const info = await page.evaluate(() => ({
      text: document.body.innerText,
      bg: getComputedStyle(document.body).backgroundColor,
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      height: document.body.scrollHeight,
      links: document.querySelectorAll("a").length,
      buttons: document.querySelectorAll("button").length,
      inputs: document.querySelectorAll("input, textarea, select").length,
    }));
    if (info.text.trim().length < 300) {
      ok = false;
      notes.push(`THIN PAGE textLen=${info.text.length}`);
    }
    if (info.overflowX > 4) {
      ok = false;
      notes.push(`HORIZONTAL OVERFLOW ${info.overflowX}px`);
    }
    if (info.bg === "rgba(0, 0, 0, 0)" || info.bg === "rgb(255, 255, 255)") {
      ok = false;
      notes.push(`theme not applied (body bg ${info.bg})`);
    }
    for (const exp of expects) {
      if (!info.text.toLowerCase().includes(exp.toLowerCase())) {
        ok = false;
        notes.push(`MISSING COPY: "${exp}"`);
      }
    }
    notes.push(
      `bg=${info.bg} textLen=${info.text.length} links=${info.links} buttons=${info.buttons} inputs=${info.inputs} h=${info.height}`,
    );
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  } catch (e) {
    ok = false;
    notes.push(`NAV ERROR: ${String(e).slice(0, 200)}`);
  }
  rows.push({ route: name, pass: ok, notes });
}

// ---- desktop pass ----------------------------------------------------------
await audit("landing", "#/", [
  "Is your IPTV provider",
  "rebrand",
  "How it works",
  "Identify a provider",
  "BEST MATCH: T-Rex",
]);

// CTA must lead into the workspace.
await page.goto(`${BASE}/#/`, { waitUntil: "load" });
await page.waitForTimeout(800);
const cta = page.getByRole("link", { name: /Identify a provider/i }).first();
await cta.click();
await page.waitForTimeout(1500);
const afterCta = page.url();
const identifyOk =
  afterCta.includes("/app") &&
  (await page.getByRole("button", { name: /identify|start|run|collect/i }).count()) > 0;
rows.push({
  route: "cta→workspace",
  pass: identifyOk,
  notes: [`url=${afterCta}`],
});

await audit("workspace/identify", "#/app", [
  "Identify",
  "Saved scans",
  "Compare",
  "Investigate",
  "Providers",
]);
await audit("workspace/scans", "#/app/scans", ["Saved scans"]);
await audit("workspace/compare", "#/app/compare", ["Compare"]);
await audit("workspace/investigate", "#/app/investigate", ["Investigate"]);
await audit("workspace/providers", "#/app/providers", ["Providers"]);

// ---- mobile pass -----------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await audit("mobile/landing", "#/", ["Identify a provider"]);
await audit("mobile/identify", "#/app", ["Identify"]);
await page.setViewportSize({ width: 1440, height: 900 });

await browser.close();

// ---- report ----------------------------------------------------------------
const summary = {
  base: BASE,
  pass: rows.filter((r) => r.pass).length,
  fail: rows.filter((r) => !r.pass).length,
  rows,
  sockets: [...sockets],
  consoleErrors,
  pageErrors,
  failedReqs: [...new Set(failedReqs)],
  screenshots: SHOTS,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(rows.some((r) => !r.pass) || pageErrors.length > 0 ? 1 : 0);
