import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Validators mirroring the Python app's fingerprint data structures.

const namingPatterns = v.object({
  uses_pipes: v.boolean(),
  uses_brackets: v.boolean(),
  uses_emoji: v.boolean(),
  uses_unicode_stars: v.boolean(),
  separator_char: v.union(v.string(), v.null()),
  country_code_style: v.union(v.string(), v.null()),
  sample_names: v.array(v.string()),
});

export const category = v.object({
  category_id: v.string(),
  category_name: v.string(),
});

export const matchResult = v.object({
  provider_id: v.string(),
  display_name: v.string(),
  score: v.number(),
  verdict: v.string(),
  signals: v.array(v.string()),
});

const headerInfo = v.object({
  url: v.string(),
  hostname: v.string(),
  port: v.number(),
  server_software: v.union(v.string(), v.null()),
  cloudflare: v.boolean(),
  cf_ray: v.union(v.string(), v.null()),
  cdn_detected: v.union(v.string(), v.null()),
  http_headers: v.record(v.string(), v.string()),
  ssl_sans: v.array(v.string()),
  ssl_issuer: v.union(v.string(), v.null()),
  ssl_subject: v.union(v.string(), v.null()),
  ssl_not_before: v.union(v.string(), v.null()),
  ssl_not_after: v.union(v.string(), v.null()),
  panel_fingerprint: v.optional(
    v.object({
      port: v.number(),
      server: v.string(),
      status: v.number(),
      content_type: v.string(),
    }),
  ),
});

const dnsInfo = v.object({
  domain: v.string(),
  a_records: v.array(v.string()),
  mx_records: v.array(v.string()),
  ns_records: v.array(v.string()),
  txt_records: v.array(v.string()),
  ip_info: v.record(v.string(), v.any()),
  crt_sh: v.array(
    v.object({
      id: v.union(v.number(), v.string()),
      issuer: v.string(),
      not_before: v.string(),
      not_after: v.string(),
      common_name: v.string(),
      names: v.array(v.string()),
    }),
  ),
  reverse_ip_domains: v.array(v.string()),
});

const whoisInfo = v.object({
  domain: v.string(),
  registrar: v.union(v.string(), v.null()),
  creation_date: v.union(v.string(), v.null()),
  expiry_date: v.union(v.string(), v.null()),
  updated_date: v.union(v.string(), v.null()),
  nameservers: v.array(v.string()),
  registrant_country: v.union(v.string(), v.null()),
  privacy_protected: v.boolean(),
});

export const dnsEntry = v.object({
  headers: headerInfo,
  dns: dnsInfo,
  whois: v.optional(whoisInfo),
  osint: v.optional(v.any()),
});

export const xtreamData = v.object({
  api_type: v.union(v.string(), v.null()),
  server_info: v.record(v.string(), v.any()),
  user_info: v.record(v.string(), v.any()),
  categories: v.array(category),
  category_count: v.number(),
  stream_count: v.number(),
  // Compact sorted stream/category id sets, comma-joined to keep documents small.
  stream_id_set: v.string(),
  category_id_set: v.string(),
  logo_domains: v.array(v.string()),
  epg_urls: v.array(v.string()),
  naming_patterns: namingPatterns,
  vod_categories: v.array(category),
  vod_stream_count: v.number(),
  vod_streams: v.array(v.object({ name: v.string() })),
  series_categories: v.array(category),
});

export const channelRow = v.object({
  category_id: v.string(),
  category_name: v.string(),
  stream_id: v.string(),
  channel_name: v.string(),
  epg_channel_id: v.string(),
  stream_icon: v.string(),
});

export const scanStats = v.object({
  category_count: v.number(),
  stream_count: v.number(),
  vod_count: v.number(),
  series_count: v.number(),
  domain_count: v.number(),
  logo_domain_count: v.number(),
  epg_count: v.number(),
});

// The full payload written by the collect action.
export const scanPayload = v.object({
  name: v.string(),
  aliases: v.array(v.string()),
  all_domains: v.array(v.string()),
  xtream: xtreamData,
  dns_entries: v.record(v.string(), dnsEntry),
  primary_domain: v.string(),
  server_software: v.union(v.string(), v.null()),
  cloudflare: v.boolean(),
  a_records: v.array(v.string()),
  stream_sample: v.optional(v.any()),
  stats: scanStats,
});

export const providerProfile = v.object({
  display_name: v.string(),
  known_dns: v.array(v.string()),
  sample_category_ids: v.array(v.string()),
  sample_stream_ids: v.array(v.string()),
  category_names_ordered: v.array(v.string()),
  naming_pattern: v.object({
    uses_pipes: v.boolean(),
    uses_brackets: v.boolean(),
    uses_unicode_stars: v.boolean(),
    separator_char: v.string(),
    country_code_style: v.string(),
    quirks: v.array(v.string()),
  }),
  logo_domains: v.array(v.string()),
  stream_count_range: v.array(v.number()),
  category_count_range: v.array(v.number()),
  vod_category_count: v.union(v.number(), v.null()),
  series_category_count: v.union(v.number(), v.null()),
  server_software: v.union(v.string(), v.null()),
  api_type: v.union(v.string(), v.null()),
  timezone: v.union(v.string(), v.null()),
  notes: v.array(v.string()),
});

export default defineSchema({
  scans: defineTable({
    name: v.string(),
    collected_at: v.number(),
    aliases: v.array(v.string()),
    all_domains: v.array(v.string()),
    xtream: xtreamData,
    dns_entries: v.record(v.string(), dnsEntry),
    // Compact top-level fields used by matching and the list view.
    primary_domain: v.string(),
    server_software: v.union(v.string(), v.null()),
    cloudflare: v.boolean(),
    a_records: v.array(v.string()),
    stream_sample: v.optional(v.any()),
    matches: v.array(matchResult),
    stats: v.object({
      category_count: v.number(),
      stream_count: v.number(),
      vod_count: v.number(),
      series_count: v.number(),
      domain_count: v.number(),
      logo_domain_count: v.number(),
      epg_count: v.number(),
    }),
  })
    .index("by_name", ["name"])
    .index("by_collected_at", ["collected_at"]),

  channels: defineTable({
    scan_id: v.id("scans"),
    chunk: v.number(),
    rows: v.array(channelRow),
  }).index("by_scan_chunk", ["scan_id", "chunk"]),

  providers: defineTable({
    provider_id: v.string(),
    profile: providerProfile,
    created_at: v.number(),
    source_scan: v.string(),
  }).index("by_provider_id", ["provider_id"]),

  jobs: defineTable({
    kind: v.union(
      v.literal("collect"),
      v.literal("investigate"),
      v.literal("enrich"),
    ),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("error"),
    ),
    step: v.string(),
    log: v.string(),
    result_scan: v.optional(v.string()),
    error: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_created_at", ["created_at"]),
});
