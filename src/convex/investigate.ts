"use node";
// "Investigate a domain" — infrastructure lookup without a login.
// Returns the entry plus the full log so the UI can render a terminal view.
import { v } from "convex/values";
import { investigateDomain } from "../lib/collectors";
import { hostnameOfUrl } from "../lib/domains";
import type { DnsEntry } from "../lib/types";
import { action } from "./_generated/server";

const BAR = "=".repeat(60);

export const run = action({
  args: {
    domain: v.string(),
    port: v.optional(v.number()),
    whois: v.optional(v.boolean()),
  },
  handler: async (_ctx, { domain, port, whois }) => {
    const clean = hostnameOfUrl(domain) ?? domain.trim().toLowerCase();
    if (!clean) throw new Error("Please provide a domain.");

    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
    };

    log(BAR);
    log(`  INVESTIGATING: ${clean}`);
    log(BAR);

    const entry: DnsEntry = await investigateDomain(clean, {
      port,
      whois: whois !== false,
      log,
      censysKey: process.env.CENSYS_API_KEY ?? "",
      urlscanKey: process.env.URLSCAN_API_KEY ?? "",
    });

    log(`\n${BAR}`);
    log(`  INVESTIGATION COMPLETE: ${clean}`);
    log(BAR);

    return { domain: clean, entry, log: lines.join("\n") };
  },
});
