// Shared helpers used by Convex queries and mutations.
import { builtinProviders } from "../lib/providers";
import { matchAgainstKnown } from "../lib/match";
import type { MatchResult, ProviderProfile } from "../lib/types";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function getScanByName(ctx: Ctx, name: string): Promise<Doc<"scans"> | null> {
  return await ctx.db
    .query("scans")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

export async function requireScanByName(ctx: Ctx, name: string): Promise<Doc<"scans">> {
  const scan = await getScanByName(ctx, name);
  if (!scan) {
    const all = await ctx.db.query("scans").collect();
    const available = all.map((s) => s.name).join(", ") || "none";
    throw new Error(`No saved scan called '${name}'. Available: ${available}`);
  }
  return scan;
}

export async function loadProviders(ctx: Ctx): Promise<Record<string, ProviderProfile>> {
  const user: Record<string, ProviderProfile> = {};
  for (const doc of await ctx.db.query("providers").collect()) {
    user[doc.provider_id] = doc.profile;
  }
  return { ...builtinProviders, ...user };
}

export function computeMatches(
  scan: Doc<"scans">,
  providers: Record<string, ProviderProfile>,
): MatchResult[] {
  return matchAgainstKnown(
    {
      xtream: scan.xtream,
      primary_domain: scan.primary_domain,
      server_software: scan.server_software,
    },
    providers,
  );
}

export async function recomputeScanMatches(
  ctx: MutationCtx,
  scan: Doc<"scans">,
  providers?: Record<string, ProviderProfile>,
): Promise<MatchResult[]> {
  const providerMap = providers ?? (await loadProviders(ctx));
  const matches = computeMatches(scan, providerMap);
  await ctx.db.patch(scan._id, { matches });
  return matches;
}

export async function deleteChannelsForScan(
  ctx: MutationCtx,
  scanId: Id<"scans">,
): Promise<void> {
  const chunks = await ctx.db
    .query("channels")
    .withIndex("by_scan_chunk", (q) => q.eq("scan_id", scanId))
    .collect();
  for (const chunk of chunks) await ctx.db.delete(chunk._id);
}
