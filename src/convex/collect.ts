"use node";
// The main "Identify a provider" flow: Xtream collection, per-domain
// infrastructure investigation, optional stream sample, save + match.
import { v } from "convex/values";
import { collectStreamSample, investigateDomain, xtreamCollect } from "../lib/collectors";
import { hostnameOfUrl, parseDomains, portOfUrl, splitCsv } from "../lib/domains";
import type { DnsEntry } from "../lib/types";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";

const BAR = "=".repeat(60);

function printRow(domain: string, entry: DnsEntry): string {
  const ip = entry.dns.a_records[0] ?? "?";
  const cf = entry.headers.cloudflare ? "CF" : "direct";
  const sw = entry.headers.server_software ?? "?";
  return `    ${domain.padEnd(40)} ${ip.padEnd(16)} ${sw.padEnd(12)} ${cf.padEnd(8)}`;
}

export const start = action({
  args: {
    job_id: v.id("jobs"),
    name: v.string(),
    url: v.string(),
    user: v.string(),
    password: v.string(),
    dns: v.optional(v.string()),
    epg: v.optional(v.string()),
    stream_test: v.optional(v.boolean()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const log = async (line: string) => {
      await ctx.runMutation(internal.jobs.append, { id: args.job_id, line });
    };
    const step = async (s: string) => {
      await ctx.runMutation(internal.jobs.append, { id: args.job_id, step: s });
    };

    try {
      await log(BAR);
      await log(`  FINGERPRINTING: ${args.name}`);
      await log(BAR);

      // 1. Xtream API collection
      await step("Xtream API collection");
      await log("\n[1] Xtream API Collection");
      const { xtream, channels, firstStreamId } = await xtreamCollect(
        args.url,
        args.user,
        args.password,
        log,
      );

      // 2. Investigate each DNS entry (WHOIS only for primary to avoid rate limits)
      const primaryDomain = hostnameOfUrl(args.url);
      if (!primaryDomain) throw new Error(`Invalid server URL: ${args.url}`);
      const extras = parseDomains(args.dns).filter((d) => d !== primaryDomain);
      const allDomains = [primaryDomain, ...extras];
      const urlPort = portOfUrl(args.url);

      const dnsEntries: Record<string, DnsEntry> = {};
      const censysKey = process.env.CENSYS_API_KEY ?? "";
      const urlscanKey = process.env.URLSCAN_API_KEY ?? "";
      const totalSteps = 1 + allDomains.length + (args.stream_test ? 1 : 0) + 2;

      for (let i = 0; i < allDomains.length; i++) {
        const domain = allDomains[i];
        const isPrimary = domain === primaryDomain;
        await step(`Investigating ${domain} (${isPrimary ? "primary" : "alternate"})`);
        await log(
          `\n[${i + 2}/${totalSteps}] Investigating ${domain} ${isPrimary ? "(primary)" : "(alternate)"}`,
        );
        dnsEntries[domain] = await investigateDomain(domain, {
          port: isPrimary ? urlPort : undefined,
          whois: isPrimary,
          log,
          censysKey,
          urlscanKey,
        });
      }

      // 3. Optional stream sample
      let streamSample: unknown = undefined;
      if (args.stream_test && firstStreamId) {
        await step("Stream analysis");
        await log(`\n[${totalSteps - 1}/${totalSteps}] Stream Analysis`);
        const streamUrl =
          `${args.url.replace(/\/+$/, "")}/live/${encodeURIComponent(args.user)}` +
          `/${encodeURIComponent(args.password)}/${firstStreamId}.ts`;
        streamSample = await collectStreamSample(streamUrl, log);
      }

      // Merge user-supplied EPG URLs
      const userEpgs = splitCsv(args.epg);
      if (userEpgs.length > 0) {
        xtream.epg_urls = [...new Set([...xtream.epg_urls, ...userEpgs])].sort();
        await log(`\n  [+] EPG URLs: ${xtream.epg_urls.join(", ")}`);
      }

      const primaryEntry = dnsEntries[primaryDomain];
      if (!primaryEntry) throw new Error(`Investigation failed for ${primaryDomain}`);

      // Fingerprint summary (port of cmd_collect's summary block)
      await log(`\n${BAR}`);
      await log(`  FINGERPRINT SUMMARY: ${args.name}`);
      await log(BAR);
      await log(`  API type:        ${xtream.api_type ?? "unknown"}`);
      await log(`  Categories:      ${xtream.categories.length}`);
      await log(`  Live streams:    ${xtream.stream_count}`);
      await log(`  VOD items:       ${xtream.vod_stream_count}`);
      await log(`  Series cats:     ${xtream.series_categories.length}`);
      await log(`  Logo domains:    ${xtream.logo_domains.length}`);
      await log(`  EPG URLs:        ${xtream.epg_urls.length}`);
      await log(`  DNS entries:     ${allDomains.length} investigated`);
      for (const domain of allDomains) {
        const entry = dnsEntries[domain];
        if (entry) await log(printRow(domain, entry));
      }
      await log(BAR);

      // 4. Save (matching happens inside the mutation) + stream channels
      await step("Saving scan and matching");
      const payload = {
        name: args.name,
        aliases: [],
        all_domains: allDomains,
        xtream,
        dns_entries: dnsEntries,
        primary_domain: primaryDomain,
        server_software: primaryEntry.headers.server_software,
        cloudflare: primaryEntry.headers.cloudflare,
        a_records: primaryEntry.dns.a_records,
        ...(streamSample !== undefined ? { stream_sample: streamSample } : {}),
        stats: {
          category_count: xtream.categories.length,
          stream_count: xtream.stream_count,
          vod_count: xtream.vod_stream_count,
          series_count: xtream.series_categories.length,
          domain_count: allDomains.length,
          logo_domain_count: xtream.logo_domains.length,
          epg_count: xtream.epg_urls.length,
        },
      };

      const { scanId, matches } = await ctx.runMutation(internal.scans.saveScan, { payload });

      await step("Storing channel list");
      const CHUNK = 2500;
      for (let i = 0, chunk = 0; i < channels.length; i += CHUNK, chunk++) {
        await ctx.runMutation(internal.scans.saveChannels, {
          scan_id: scanId,
          chunk,
          rows: channels.slice(i, i + CHUNK),
        });
      }

      // Match report (port of print_known_match_report)
      await log(`\n${BAR}`);
      await log(`  KNOWN PROVIDER MATCHING: ${args.name}`);
      await log(BAR);
      if (matches.length === 0) {
        await log("\n  No matches found against your known providers.");
        await log("  This appears to be an unknown/unique source.");
      } else {
        const icons: Record<string, string> = {
          MATCH: "***",
          LIKELY: "**",
          POSSIBLE: "*",
          WEAK: ".",
        };
        for (const m of matches) {
          const marker = icons[m.verdict] ?? ".";
          await log(`\n  ${marker} ${m.display_name} [${m.verdict}] (score: ${m.score})`);
          for (const signal of m.signals) await log(`      ${signal}`);
        }
        const best = matches[0];
        await log(`\n  BEST MATCH: ${best.display_name} (${best.verdict}, score: ${best.score})`);
        await log(BAR);
      }

      await step("Done");
      await ctx.runMutation(internal.jobs.finish, {
        id: args.job_id,
        status: "done",
        result_scan: args.name,
        step: "Complete",
      });
      return { ok: true as const, scan_name: args.name };
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
