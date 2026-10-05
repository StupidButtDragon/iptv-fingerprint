/**
 * Donate button verification.
 *
 *   bun scripts/donate-test.ts empty  [baseUrl]  — donateUrl unset: dimmed
 *       span with a "coming soon" hint, shown on the landing footer and the
 *       app sidebar, no navigation target.
 *   bun scripts/donate-test.ts linked [baseUrl]  — donateUrl set: real anchor
 *       opening in a new tab in both places.
 *
 * Exits non-zero on any problem.
 */
import { chromium } from "playwright";

const mode = process.argv[2];
if (mode !== "empty" && mode !== "linked") {
  console.error("usage: bun scripts/donate-test.ts empty|linked [baseUrl]");
  process.exit(2);
}
const BASE = (process.argv[3] ?? "https://5173-ij4ge07sk6efgg0e8mdec.e2b.app").replace(/\/$/, "");

const problems: string[] = [];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`);
});

async function donate(where: string) {
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      href: el.getAttribute("href"),
      target: el.getAttribute("target"),
      title: el.getAttribute("title"),
      label: el.getAttribute("aria-label"),
      text: (el.textContent ?? "").trim(),
      visible: cs.display !== "none" && cs.visibility !== "hidden",
      opacity: cs.opacity,
    };
  }, where);
  return info;
}

// Landing footer
await page.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const landing = await donate('footer a[aria-label^="Donate"], footer span[aria-label^="Donate"]');
if (!landing) problems.push("landing footer: donate button not found");
else {
  if (!landing.visible) problems.push("landing footer: donate button not visible");
  if (!/Donate/.test(landing.text)) problems.push(`landing footer: unexpected text "${landing.text}"`);
  if (mode === "empty") {
    if (landing.tag !== "SPAN") problems.push(`landing: expected span (no link yet), got ${landing.tag}`);
    if (landing.href) problems.push(`landing: expected no href, got ${landing.href}`);
    if (landing.title !== "Donate link coming soon")
      problems.push(`landing: missing "coming soon" title (got ${landing.title})`);
  } else {
    if (landing.tag !== "A") problems.push(`landing: expected anchor, got ${landing.tag}`);
    if (!landing.href?.includes("example.com/donate"))
      problems.push(`landing: wrong href ${landing.href}`);
    if (landing.target !== "_blank") problems.push("landing: expected target=_blank");
  }
}

// App sidebar
await page.goto(`${BASE}/#/app/scans`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const app = await donate('aside a[aria-label^="Donate"], aside span[aria-label^="Donate"]');
if (!app) problems.push("app sidebar: donate button not found");
else {
  if (!app.visible) problems.push("app sidebar: donate button not visible");
  if (mode === "empty" && app.tag !== "SPAN")
    problems.push(`app: expected span, got ${app.tag}`);
  if (mode === "linked" && (app.tag !== "A" || !app.href?.includes("example.com/donate")))
    problems.push(`app: expected linked anchor, got ${app.tag} ${app.href}`);
}

const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
if (overflow > 2) problems.push(`horizontal overflow (+${overflow}px)`);

await browser.close();

console.log(`mode=${mode}`);
console.log(`landing: ${JSON.stringify(landing)}`);
console.log(`app: ${JSON.stringify(app)}`);
console.log("=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "(none)");
if (problems.length) process.exit(1);
