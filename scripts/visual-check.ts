/**
 * Browser-level smoke check for the web UI.
 *
 * Loads every route of the managed preview, records console errors, page
 * errors, failed requests, and Convex traffic, then writes screenshots to
 * scripts/shots/.
 *
 * Usage: bun scripts/visual-check.ts [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "https://5173-ij4ge07sk6efgg0e8mdec.e2b.app").replace(/\/$/, "");

const routes: Array<[string, string]> = [
  ["landing", "/#/"],
  ["identify", "/#/app"],
  ["scans", "/#/app/scans"],
  ["compare", "/#/app/compare"],
  ["investigate", "/#/app/investigate"],
  ["providers", "/#/app/providers"],
];

mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const convexResponses: string[] = [];

context.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 400));
});
context.on("page", (page) => {
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 400)));
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText ?? "unknown";
    failedRequests.push(`${err} ${req.url().slice(0, 200)}`);
  });
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("-ij4ge07sk6efgg0e8mdec.e2b.app") && !url.includes(":5173") && !url.includes("/5173-")) {
      if (url.includes("3210") || url.includes("/api") || url.includes("version")) {
        convexResponses.push(`${res.status()} ${url.slice(0, 160)}`);
      }
    }
  });
});

const results: string[] = [];

for (const [name, path] of routes) {
  const page = await context.newPage();
  const localFailures: string[] = [];
  page.on("requestfailed", (req) =>
    localFailures.push(`${req.failure()?.errorText ?? "?"} ${req.url().slice(0, 160)}`),
  );
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: name === "landing" });
    const text = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\s+/g, " "));
    results.push(`[${name}] OK :: ${text}`);
  } catch (err) {
    results.push(`[${name}] FAIL :: ${String(err).slice(0, 300)}`);
  }
  if (localFailures.length) results.push(`[${name}] requestfailed: ${localFailures.join(" | ")}`);
  await page.close();
}

await browser.close();

const uniq = (xs: string[]) => [...new Set(xs)];
console.log("=== ROUTES ===");
for (const r of results) console.log(r);
console.log("=== CONVEX RESPONSES ===");
console.log(uniq(convexResponses).join("\n") || "(none)");
console.log("=== CONSOLE ERRORS ===");
console.log(uniq(consoleErrors).join("\n") || "(none)");
console.log("=== PAGE ERRORS ===");
console.log(uniq(pageErrors).join("\n") || "(none)");
console.log("=== FAILED REQUESTS ===");
console.log(uniq(failedRequests).join("\n") || "(none)");
