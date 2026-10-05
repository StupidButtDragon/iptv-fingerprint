// End-to-end check for the collect pipeline.
// Spawns the mock Xtream server, drives a real collect job through the local
// Convex deployment, then asserts the job finished and T-Rex scored a MATCH.
//
// Run: bun scripts/e2e-mock.ts
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const SCAN_NAME = "e2e-mock-scan";
const MOCK_PORT = 8081;

function convexRun(fn: string, args: Record<string, unknown>): string {
  const res = spawnSync("bun", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf-8",
    timeout: 240_000,
  });
  if (res.status !== 0) {
    throw new Error(`convex run ${fn} failed: ${res.stderr || res.stdout}`);
  }
  return (res.stdout ?? "").trim();
}

function fail(msg: string): never {
  console.error(`\nE2E FAILED: ${msg}`);
  process.exit(1);
}

// 1. Spawn the mock provider
const mock = spawn("python3", ["scripts/mock-xtream.py", String(MOCK_PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
});
let mockLog = "";
mock.stdout.on("data", (d) => (mockLog += String(d)));
mock.stderr.on("data", (d) => (mockLog += String(d)));

const cleanup = () => {
  if (!mock.killed) mock.kill("SIGTERM");
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

// 2. Wait for readiness
let ready = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://localhost:${MOCK_PORT}/player_api.php?username=a&password=b`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    /* not up yet */
  }
  await sleep(250);
}
if (!ready) {
  cleanup();
  fail(`mock server did not start. log: ${mockLog}`);
}
console.log("✓ mock Xtream server ready");

try {
  // 3. Run a real collect job
  const jobId = JSON.parse(convexRun("jobs:create", { kind: "collect" }));
  console.log(`✓ job created: ${jobId}`);

  const started = Date.now();
  const result = convexRun("collect:start", {
    job_id: jobId,
    name: SCAN_NAME,
    url: `http://localhost:${MOCK_PORT}`,
    user: "demo",
    password: "demo",
  });
  console.log(`✓ collect:start finished in ${((Date.now() - started) / 1000).toFixed(1)}s → ${result}`);

  // 4. Inspect the job
  const job = JSON.parse(convexRun("jobs:get", { id: jobId }));
  console.log(`  job status: ${job.status} · step: ${job.step}`);
  if (job.status !== "done") {
    console.error(job.log);
    cleanup();
    fail(`job status is '${job.status}' (expected 'done')`);
  }

  // 5. Inspect the saved scan
  const scan = JSON.parse(convexRun("scans:get", { name: SCAN_NAME }));
  if (!scan) fail("scan was not saved");

  console.log(`  scan stats: ${JSON.stringify(scan.stats)}`);

  const matches = scan.matches ?? [];
  const trex = matches.find((m: any) => m.provider_id === "trex");
  console.log("  matches:");
  for (const m of matches.slice(0, 5)) {
    console.log(`    ${m.verdict.padEnd(9)} ${m.display_name} (${m.score})`);
  }

  if (!trex) {
    console.error("  signals:", trex);
    cleanup();
    fail("no match against the built-in T-Rex profile");
  }
  if (trex.verdict !== "MATCH") {
    cleanup();
    fail(`expected T-Rex verdict MATCH, got ${trex.verdict} (${trex.score})`);
  }
  if (scan.stats.stream_count !== 2000) {
    cleanup();
    fail(`expected 2000 streams, got ${scan.stats.stream_count}`);
  }
  if (scan.stats.domain_count !== 1) {
    cleanup();
    fail(`expected 1 domain, got ${scan.stats.domain_count}`);
  }

  // 6. Check channels were stored for CSV export
  const channels = JSON.parse(
    convexRun("channels:page", {
      scan_id: scan._id,
      paginationOpts: { numItems: 3, cursor: null },
    }),
  );
  const stored = channels.page?.reduce((n: number, c: any) => n + c.rows.length, 0) ?? 0;
  console.log(`  first page holds ${stored} channels`);
  if (stored < 1000) {
    cleanup();
    fail(`expected thousands of stored channels on the first page, got ${stored}`);
  }

  console.log("\nE2E PASSED: collect → save → match → channels all working.");
  cleanup();
  process.exit(0);
} catch (err) {
  cleanup();
  fail(err instanceof Error ? err.message : String(err));
}
