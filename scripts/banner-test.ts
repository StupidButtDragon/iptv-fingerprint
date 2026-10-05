/**
 * Banner slot verification.
 *
 *   bun scripts/banner-test.ts present [baseUrl]
 *     — banners configured in src/lib/banners.ts must render on the landing
 *       page and under /app, and <script> tags inside the HTML must execute.
 *
 *   bun scripts/banner-test.ts absent [baseUrl]
 *     — empty slots must be hidden entirely (no ad asides on any page).
 *
 * Exits non-zero on any problem.
 */
import { chromium } from "playwright";

const mode = process.argv[2];
if (mode !== "present" && mode !== "absent") {
  console.error("usage: bun scripts/banner-test.ts present|absent [baseUrl]");
  process.exit(2);
}
const BASE = (process.argv[3] ?? "https://5173-ij4ge07sk6efgg0e8mdec.e2b.app").replace(/\/$/, "");

const problems: string[] = [];
const notes: string[] = [];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`);
});

const AD = 'aside[aria-label="Advertisement"]';

async function count(sel: string) {
  return page.locator(sel).count();
}

// Landing page
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const landingAds = await count(AD);
notes.push(`landing: ${landingAds} ad aside(s)`);

if (mode === "present") {
  if (landingAds < 1) problems.push("landing: expected the landing-top banner to render");
  if ((await count("#ad-test")) !== 1) problems.push("landing: #ad-test banner HTML missing");
  const ran = await count("#ad-test[data-ran='1']");
  if (ran !== 1) problems.push("landing: banner <script> did not execute");
  const label = await page.getByText("Advertisement", { exact: true }).count();
  if (label < 1) problems.push("landing: Advertisement caption missing");
  await page.screenshot({ path: "scripts/shots/banner-present.png" });
} else {
  if (landingAds !== 0) problems.push(`landing: expected 0 ad asides, found ${landingAds}`);
  if ((await count("#ad-test")) !== 0) problems.push("landing: empty slot still rendering HTML");
}

// App page
await page.goto(`${BASE}/#/app/scans`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const appAds = await count(AD);
notes.push(`app: ${appAds} ad aside(s)`);

if (mode === "present") {
  if (appAds < 1) problems.push("app: expected the app-footer banner to render");
  if ((await count("#ad-app-test")) !== 1) problems.push("app: #ad-app-test banner HTML missing");
} else {
  if (appAds !== 0) problems.push(`app: expected 0 ad asides, found ${appAds}`);
}

// Layout must not overflow because of the banner
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (overflow > 2) problems.push(`app: horizontal overflow caused by banner (+${overflow}px)`);
notes.push(`app overflow delta: ${overflow}px`);

await browser.close();

console.log("=== NOTES ===");
for (const n of notes) console.log(n);
console.log("=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "(none)");
if (problems.length) process.exit(1);
