// Known-provider database: built-in profiles from known_providers.json plus
// user-promoted profiles stored in Convex (equivalent of providers.json).
import { v } from "convex/values";
import { parseDomains } from "../lib/domains";
import { builtinProviders } from "../lib/providers";
import type { ProviderProfile } from "../lib/types";
import { mutation, query } from "./_generated/server";
import { loadProviders, requireScanByName, recomputeScanMatches } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userDocs = await ctx.db.query("providers").collect();
    const user = userDocs.map((d) => ({
      provider_id: d.provider_id,
      profile: d.profile,
      source_scan: d.source_scan,
      created_at: d.created_at,
    }));
    const builtin = Object.entries(builtinProviders).map(([provider_id, profile]) => ({
      provider_id,
      profile,
    }));
    return { builtin, user };
  },
});

// Internal: raw user profiles, merged over the built-ins by callers.
export const listForMatching = query({
  args: {},
  handler: async (ctx) => await loadProviders(ctx),
});

// Port of cli.cmd_promote — turn a saved scan into a reference profile.
export const promote = mutation({
  args: {
    scan_name: v.string(),
    provider_id: v.string(),
    display_name: v.string(),
    extra_domains: v.string(),
  },
  handler: async (ctx, { scan_name, provider_id, display_name, extra_domains }) => {
    const providerId = provider_id.trim().toLowerCase().replace(/\s+/g, "-");
    if (!providerId) throw new Error("Provider ID cannot be empty.");
    if (providerId in builtinProviders) {
      throw new Error(
        `'${providerId}' is a built-in provider ID. Choose a different ID so you don't shadow the shipped profile.`,
      );
    }

    const scan = await requireScanByName(ctx, scan_name);
    const xt = scan.xtream;
    const categories = xt.categories;

    const catIds = categories.slice(0, 30).map((c) => c.category_id);
    const catNames = categories.slice(0, 9).map((c) => c.category_name);
    const streamIds = xt.stream_id_set.split(",").filter(Boolean).slice(0, 30);

    const knownDns = [...scan.all_domains];
    if (scan.primary_domain && !knownDns.includes(scan.primary_domain)) {
      knownDns.unshift(scan.primary_domain);
    }
    for (const d of parseDomains(extra_domains)) {
      if (!knownDns.includes(d)) knownDns.push(d);
    }

    const streamCount = xt.stream_count;
    const catCount = categories.length;
    const margin = Math.max(Math.floor(streamCount * 0.05), 500);
    const catMargin = Math.max(Math.floor(catCount * 0.05), 20);

    const profile: ProviderProfile = {
      display_name,
      known_dns: knownDns,
      sample_category_ids: catIds,
      sample_stream_ids: streamIds,
      category_names_ordered: catNames,
      naming_pattern: {
        uses_pipes: xt.naming_patterns.uses_pipes,
        uses_brackets: xt.naming_patterns.uses_brackets,
        uses_unicode_stars: xt.naming_patterns.uses_unicode_stars,
        separator_char: xt.naming_patterns.separator_char ?? "",
        country_code_style: xt.naming_patterns.country_code_style ?? "",
        quirks: [],
      },
      logo_domains: xt.logo_domains.slice(0, 10),
      stream_count_range: [streamCount - margin, streamCount + margin],
      category_count_range: [catCount - catMargin, catCount + catMargin],
      vod_category_count: xt.vod_categories.length || null,
      series_category_count: xt.series_categories.length || null,
      server_software: scan.server_software,
      api_type: xt.api_type ?? "player_api.php",
      timezone: typeof xt.server_info.timezone === "string" ? xt.server_info.timezone : "",
      notes: [
        `Auto-promoted from scan of ${scan_name}`,
        `Cloudflare: ${scan.cloudflare}`,
        `Scanned domain: ${scan.primary_domain}`,
      ],
    };

    const existing = await ctx.db
      .query("providers")
      .withIndex("by_provider_id", (q) => q.eq("provider_id", providerId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { profile, source_scan: scan_name });
    } else {
      await ctx.db.insert("providers", {
        provider_id: providerId,
        profile,
        source_scan: scan_name,
        created_at: Date.now(),
      });
    }

    // Every saved scan may now match the new profile — refresh their verdicts.
    const providers = await loadProviders(ctx);
    const scans = await ctx.db.query("scans").collect();
    for (const s of scans) {
      await recomputeScanMatches(ctx, s, providers);
    }

    return {
      provider_id: providerId,
      replaced: existing !== null,
      dns_count: knownDns.length,
      stream_ids: streamIds.length,
      category_ids: catIds.length,
      stream_range: profile.stream_count_range,
      category_range: profile.category_count_range,
    };
  },
});
