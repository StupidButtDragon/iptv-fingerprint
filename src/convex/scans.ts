// Scan queries and mutations: list, detail, compare, delete, re-match,
// alias, merge, enrichment, plus internal save helpers used by actions.
import { v } from "convex/values";
import { compare } from "../lib/compare";
import { matchAgainstKnown } from "../lib/match";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  deleteChannelsForScan,
  getScanByName,
  loadProviders,
  recomputeScanMatches,
  requireScanByName,
} from "./helpers";
import { channelRow, dnsEntry, scanPayload } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scans = await ctx.db.query("scans").order("desc").collect();
    return scans.map((scan) => ({
      _id: scan._id,
      name: scan.name,
      collected_at: scan.collected_at,
      aliases: scan.aliases,
      stats: scan.stats,
      primary_domain: scan.primary_domain,
      server_software: scan.server_software,
      cloudflare: scan.cloudflare,
      matches: scan.matches,
      all_domains: scan.all_domains,
    }));
  },
});

export const get = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => await getScanByName(ctx, name),
});

export const getRaw = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => await requireScanByName(ctx, name),
});

export const compareScans = query({
  args: { a: v.string(), b: v.string() },
  handler: async (ctx, { a, b }) => {
    const scanA = await requireScanByName(ctx, a);
    const scanB = await requireScanByName(ctx, b);
    return compare(scanA, scanB);
  },
});

export const deleteScan = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const scan = await requireScanByName(ctx, name);
    await deleteChannelsForScan(ctx, scan._id);
    await ctx.db.delete(scan._id);
  },
});

export const rematch = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const scan = await requireScanByName(ctx, name);
    return await recomputeScanMatches(ctx, scan);
  },
});

export const addAliases = mutation({
  args: {
    name: v.string(),
    aliases: v.array(v.string()),
    remove: v.boolean(),
  },
  handler: async (ctx, { name, aliases, remove }) => {
    const scan = await requireScanByName(ctx, name);
    let next = [...scan.aliases];
    if (remove) {
      next = next.filter((a) => !aliases.includes(a));
    } else {
      for (const alias of aliases) {
        if (!next.includes(alias) && alias !== scan.name) next.push(alias);
      }
    }
    await ctx.db.patch(scan._id, { aliases: next });
    return next;
  },
});

// Port of cli.cmd_merge — fold one scan into another as an alias.
export const mergeScans = mutation({
  args: {
    source: v.string(),
    into: v.string(),
    delete_source: v.boolean(),
  },
  handler: async (ctx, { source: sourceName, into: intoName, delete_source }) => {
    if (sourceName === intoName) throw new Error("Source and target scans are the same.");
    const source = await requireScanByName(ctx, sourceName);
    const target = await requireScanByName(ctx, intoName);

    const aliases = [...target.aliases];
    for (const a of [source.name, ...source.aliases]) {
      if (!aliases.includes(a) && a !== target.name) aliases.push(a);
    }

    const dnsEntries = { ...target.dns_entries };
    const allDomains = [...target.all_domains];
    const newDomains: string[] = [];
    for (const [domain, entry] of Object.entries(source.dns_entries)) {
      if (!(domain in dnsEntries)) {
        dnsEntries[domain] = entry;
        allDomains.push(domain);
        newDomains.push(domain);
      }
    }

    const sourceEpgs = source.xtream.epg_urls;
    const newEpgs = sourceEpgs.filter((e) => !target.xtream.epg_urls.includes(e));
    const newLogos = source.xtream.logo_domains.filter(
      (l) => !target.xtream.logo_domains.includes(l),
    );

    const xtream = {
      ...target.xtream,
      epg_urls: [...new Set([...target.xtream.epg_urls, ...sourceEpgs])].sort(),
      logo_domains: [...new Set([...target.xtream.logo_domains, ...source.xtream.logo_domains])].sort(),
    };

    await ctx.db.patch(target._id, {
      aliases,
      dns_entries: dnsEntries,
      all_domains: allDomains,
      xtream,
      stats: {
        ...target.stats,
        domain_count: allDomains.length,
        epg_count: xtream.epg_urls.length,
        logo_domain_count: xtream.logo_domains.length,
      },
    });

    const refreshed = await requireScanByName(ctx, intoName);
    const matches = await recomputeScanMatches(ctx, refreshed);

    if (delete_source) {
      await deleteChannelsForScan(ctx, source._id);
      await ctx.db.delete(source._id);
    }

    return {
      aliases,
      new_domains: newDomains,
      new_epgs: newEpgs,
      new_logos: newLogos,
      matches,
      deleted_source: delete_source,
    };
  },
});

// Called by the collect action once the fingerprint data is assembled.
export const saveScan = internalMutation({
  args: { payload: scanPayload },
  handler: async (ctx, { payload }) => {
    const existing = await getScanByName(ctx, payload.name);
    const providers = await loadProviders(ctx);
    const matches = matchAgainstKnown(
      {
        xtream: payload.xtream,
        primary_domain: payload.primary_domain,
        server_software: payload.server_software,
      },
      providers,
    );

    let scanId: Id<"scans">;
    if (existing) {
      // Reusing a scan name replaces it (like the CLI), but keeps its aliases.
      await deleteChannelsForScan(ctx, existing._id);
      await ctx.db.patch(existing._id, {
        ...payload,
        aliases: existing.aliases,
        collected_at: Date.now(),
        matches,
      });
      scanId = existing._id;
    } else {
      scanId = await ctx.db.insert("scans", {
        ...payload,
        collected_at: Date.now(),
        matches,
      });
    }
    return { scanId, matches };
  },
});

export const saveChannels = internalMutation({
  args: {
    scan_id: v.id("scans"),
    chunk: v.number(),
    rows: v.array(channelRow),
  },
  handler: async (ctx, { scan_id, chunk, rows }) => {
    if (rows.length === 0) return;
    await ctx.db.insert("channels", { scan_id, chunk, rows });
  },
});

// Called by the enrich action after new domains have been investigated.
export const applyEnrichment = internalMutation({
  args: {
    name: v.string(),
    entries: v.record(v.string(), dnsEntry),
    new_domains: v.array(v.string()),
    new_epgs: v.array(v.string()),
  },
  handler: async (ctx, { name, entries, new_domains, new_epgs }) => {
    const scan = await requireScanByName(ctx, name);

    const dnsEntries = { ...scan.dns_entries, ...entries };
    const allDomains = [...scan.all_domains];
    for (const d of new_domains) {
      if (!allDomains.includes(d)) allDomains.push(d);
    }

    const mergedEpgs = [...new Set([...scan.xtream.epg_urls, ...new_epgs])].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );

    await ctx.db.patch(scan._id, {
      dns_entries: dnsEntries,
      all_domains: allDomains,
      xtream: { ...scan.xtream, epg_urls: mergedEpgs },
      stats: {
        ...scan.stats,
        domain_count: allDomains.length,
        epg_count: mergedEpgs.length,
      },
    });

    const refreshed = await requireScanByName(ctx, name);
    const matches = await recomputeScanMatches(ctx, refreshed);
    return { matches, all_domains: allDomains, epg_urls: mergedEpgs };
  },
});

// Convenience lookup for the merge form: available scan names.
export const names = query({
  args: {},
  handler: async (ctx) => {
    const scans = await ctx.db.query("scans").order("desc").collect();
    return scans.map((s) => s.name);
  },
});
