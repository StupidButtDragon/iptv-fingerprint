"use node";
// "Add domains / EPG" — investigate extra domains for an existing scan
// without logging in again, then merge them into the saved scan.
import { v } from "convex/values";
import { investigateDomain } from "../lib/collectors";
import { parseDomains, splitCsv } from "../lib/domains";
import type { DnsEntry } from "../lib/types";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const BAR = "=".repeat(60);

export const run = action({
  args: {
    job_id: v.id("jobs"),
    name: v.string(),
    dns: v.string(),
    epg: v.optional(v.string()),
    port: v.optional(v.number()),
    whois: v.optional(v.boolean()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const log = async (line: string) => {
      await ctx.runMutation(internal.jobs.append, { id: args.job_id, line });
    };
    const step = async (s: string) => {
      await ctx.runMutation(internal.jobs.append, { id: args.job_id, step: s });
    };

    try {
      const scan: Doc<"scans"> | null = await ctx.runQuery(internal.scans.getRaw, {
        name: args.name,
      });
      if (!scan) throw new Error(`No saved scan called '${args.name}'.`);

      const newEpgs = splitCsv(args.epg);
      const parsed = parseDomains(args.dns);
      const trulyNew: string[] = parsed.filter((d) => !(d in scan.dns_entries));
      const alreadyKnown = parsed.filter((d) => d in scan.dns_entries);

      await log(BAR);
      await log(`  ENRICHING: ${args.name}`);
      await log(
        `  Adding ${trulyNew.length} new DNS entr${trulyNew.length === 1 ? "y" : "ies"}` +
          (newEpgs.length > 0 ? ` and ${newEpgs.length} EPG URL(s)` : ""),
      );
      await log(BAR);

      if (alreadyKnown.length > 0) {
        await log(`\n  [.] Already in fingerprint: ${alreadyKnown.join(", ")}`);
      }

      if (trulyNew.length === 0 && newEpgs.length === 0) {
        await log("\n  Nothing new to add.");
        await step("Nothing to do");
        await ctx.runMutation(internal.jobs.finish, {
          id: args.job_id,
          status: "done",
          result_scan: args.name,
          step: "Nothing to do",
        });
        return { ok: true as const, scan_name: args.name, added: 0 };
      }

      const entries: Record<string, DnsEntry> = {};
      const censysKey = process.env.CENSYS_API_KEY ?? "";
      const urlscanKey = process.env.URLSCAN_API_KEY ?? "";

      for (let i = 0; i < trulyNew.length; i++) {
        const domain = trulyNew[i];
        await step(`Investigating ${domain}`);
        await log(`\n[${i + 1}/${trulyNew.length}] Investigating ${domain}`);
        entries[domain] = await investigateDomain(domain, {
          port: args.port,
          whois: args.whois === true,
          log,
          censysKey,
          urlscanKey,
        });
      }

      await step("Saving enrichment");
      const result = await ctx.runMutation(internal.scans.applyEnrichment, {
        name: args.name,
        entries,
        new_domains: trulyNew,
        new_epgs: newEpgs,
      });

      await log(`\n${BAR}`);
      await log(`  ENRICHMENT COMPLETE: ${args.name}`);
      await log(`  Total DNS entries: ${result.all_domains.length}`);
      if (newEpgs.length > 0) await log(`  EPG URLs: ${result.epg_urls.join(", ")}`);
      await log(BAR);
      for (const domain of result.all_domains) {
        const entry = scan.dns_entries[domain] ?? entries[domain];
        if (!entry) continue;
        const ip = entry.dns.a_records[0] ?? "?";
        const cf = entry.headers.cloudflare ? "CF" : "direct";
        const sw = entry.headers.server_software ?? "?";
        const tag = trulyNew.includes(domain) ? "NEW" : "";
        await log(
          `    ${(domain in entries ? "+ " : "  ") + domain.padEnd(38)} ${ip.padEnd(16)} ${sw.padEnd(12)} ${cf.padEnd(8)} ${tag}`.trimEnd(),
        );
      }

      await step("Done");
      await ctx.runMutation(internal.jobs.finish, {
        id: args.job_id,
        status: "done",
        result_scan: args.name,
        step: "Complete",
      });
      return { ok: true as const, scan_name: args.name, added: trulyNew.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log(`\n  [!] ${msg}`);
      await step("Failed");
      await ctx.runMutation(internal.jobs.finish, {
        id: args.job_id,
        status: "error",
        error: msg,
        step: "Failed",
      });
      return { ok: false as const, error: msg };
    }
  },
});
