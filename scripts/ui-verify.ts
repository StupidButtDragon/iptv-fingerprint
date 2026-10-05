/**
 * Deep UI verification: scan detail rendering, CTA wiring, layout overflow
 * (desktop + mobile), and dark-theme sanity. Fails (exit 1) on any problem.
 *
 * Usage: bun scripts/ui-verify.ts [baseUrl]
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "https://5173-ij4ge07sk6efgg0e8mdec.e2b.app").replace(/\/$/, "");

const problems: string[] = [];
const notes: string[] = [];

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function openPage(width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => problems.push(`pageerror: ${String(err).slice(0, 300)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error: ${msg.text().slice(0, 300)}`);
  });
  return { ctx, page };
}

async function layoutReport(page: import("playwright").Page, label: string) {
  const info = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    textLen: document.body.innerText.replace(/\s+/g, " ").trim().length,
  }));
  if (info.scrollW > info.clientW + 2) {
    problems.push(`${label}: horizontal overflow ${info.scrollW} > ${info.clientW}`);
  }
  if (info.textLen < 80) problems.push(`${label}: suspiciously little text (${info.textLen} chars)`);
  notes.push(`${label}: text=${info.textLen}ch bg=${info.bodyBg} w=${info.scrollW}/${info.clientW}`);
}

// ---- desktop pass ----
{
  const { ctx, page } = await openPage(1440, 960);

  // Landing
  await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await layoutReport(page, "landing/desktop");
  const heroOk = (await page.locator("h1").first().isVisible().catch(() => false));
  if (!heroOk) problems.push("landing: h1 not visible");
  const cta = page.locator('a[href*="#/app"]').first();
  if ((await cta.count()) === 0) problems.push("landing: no CTA linking to #/app");
  else notes.push(`landing CTA: ${((await cta.textContent()) ?? "").trim().slice(0, 60)}`);
  const footerOk = await page.locator("footer").first().isVisible().catch(() => false);
  if (!footerOk) problems.push("landing: footer not visible");

  // Scan detail (live Convex data)
  await page.goto(`${BASE}/#/app/scans/e2e-mock-scan`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await layoutReport(page, "scan-detail/desktop");
  const detailText = await page.evaluate(() => document.body.innerText);
  for (const needle of ["e2e-mock-scan"]) {
    if (!detailText.includes(needle)) problems.push(`scan-detail: missing "${needle}"`);
  }
  const hasVerdict = /MATCH|LIKELY|POSSIBLE|WEAK|SAME SOURCE/i.test(detailText);
  if (!hasVerdict) problems.push("scan-detail: no verdict badge found");
  const hasSignals = /signals|stream|category/i.test(detailText);
  if (!hasSignals) problems.push("scan-detail: no signal/stats text found");
  await page.screenshot({ path: "scripts/shots/scan-detail.png", fullPage: false });
  notes.push(`scan-detail snippet: ${detailText.replace(/\s+/g, " ").slice(0, 260)}`);

  // Compare page should list at least one scan or show its empty state
  await page.goto(`${BASE}/#/app/compare`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await layoutReport(page, "compare/desktop");

  await ctx.close();
}

// ---- mobile pass ----
{
  const { ctx, page } = await openPage(390, 844);
  for (const [label, path] of [
    ["landing/mobile", "/#/"],
    ["identify/mobile", "/#/app"],
    ["scans/mobile", "/#/app/scans"],
  ] as const) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await layoutReport(page, label);
  }
  await page.screenshot({ path: "scripts/shots/landing-mobile.png" });
  await ctx.close();
}

await browser.close();

console.log("=== NOTES ===");
for (const n of notes) console.log(n);
console.log("=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "(none)");
if (problems.length) process.exit(1);
