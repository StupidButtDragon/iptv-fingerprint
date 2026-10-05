// Shared data types for fingerprint data. These mirror the Convex schema
// validators in src/convex/schema.ts and the Python app's structures.

export type Category = {
  category_id: string;
  category_name: string;
};

export type NamingPatterns = {
  uses_pipes: boolean;
  uses_brackets: boolean;
  uses_emoji: boolean;
  uses_unicode_stars: boolean;
  separator_char: string | null;
  country_code_style: string | null;
  sample_names: string[];
};

export type XtreamData = {
  api_type: string | null;
  server_info: Record<string, unknown>;
  user_info: Record<string, unknown>;
  categories: Category[];
  category_count: number;
  stream_count: number;
  // Comma-joined sorted ids — compact so scans fit in one document.
  stream_id_set: string;
  category_id_set: string;
  logo_domains: string[];
  epg_urls: string[];
  naming_patterns: NamingPatterns;
  vod_categories: Category[];
  vod_stream_count: number;
  vod_streams: { name: string }[];
  series_categories: Category[];
};

export type HeaderInfo = {
  url: string;
  hostname: string;
  port: number;
  server_software: string | null;
  cloudflare: boolean;
  cf_ray: string | null;
  cdn_detected: string | null;
  http_headers: Record<string, string>;
  ssl_sans: string[];
  ssl_issuer: string | null;
  ssl_subject: string | null;
  ssl_not_before: string | null;
  ssl_not_after: string | null;
  panel_fingerprint?: {
    port: number;
    server: string;
    status: number;
    content_type: string;
  };
};

export type CertRecord = {
  id: number | string;
  issuer: string;
  not_before: string;
  not_after: string;
  common_name: string;
  names: string[];
};

export type DnsInfo = {
  domain: string;
  a_records: string[];
  mx_records: string[];
  ns_records: string[];
  txt_records: string[];
  ip_info: Record<string, unknown>;
  crt_sh: CertRecord[];
  reverse_ip_domains: string[];
};

export type WhoisInfo = {
  domain: string;
  registrar: string | null;
  creation_date: string | null;
  expiry_date: string | null;
  updated_date: string | null;
  nameservers: string[];
  registrant_country: string | null;
  privacy_protected: boolean;
};

export type DnsEntry = {
  headers: HeaderInfo;
  dns: DnsInfo;
  whois?: WhoisInfo;
  osint?: unknown;
};

export type MatchResult = {
  provider_id: string;
  display_name: string;
  score: number;
  verdict: string;
  signals: string[];
};

export type ProviderProfile = {
  display_name: string;
  known_dns: string[];
  sample_category_ids: string[];
  sample_stream_ids: string[];
  category_names_ordered: string[];
  naming_pattern: {
    uses_pipes: boolean;
    uses_brackets: boolean;
    uses_unicode_stars: boolean;
    separator_char: string;
    country_code_style: string;
    quirks: string[];
  };
  logo_domains: string[];
  stream_count_range: number[];
  category_count_range: number[];
  vod_category_count: number | null;
  series_category_count: number | null;
  server_software: string | null;
  api_type: string | null;
  timezone: string | null;
  notes: string[];
};

export type ScanStats = {
  category_count: number;
  stream_count: number;
  vod_count: number;
  series_count: number;
  domain_count: number;
  logo_domain_count: number;
  epg_count: number;
};

export type ChannelRow = {
  category_id: string;
  category_name: string;
  stream_id: string;
  channel_name: string;
  epg_channel_id: string;
  stream_icon: string;
};

// Payload written by the collect action and the saveScan mutation.
export type ScanPayload = {
  name: string;
  aliases: string[];
  all_domains: string[];
  xtream: XtreamData;
  dns_entries: Record<string, DnsEntry>;
  primary_domain: string;
  server_software: string | null;
  cloudflare: boolean;
  a_records: string[];
  stream_sample?: unknown;
  stats: ScanStats;
};

export type StreamSample = {
  url_pattern: string;
  reachable: boolean;
  content_type: string | null;
  is_ts: boolean;
  pids_found: { pid: number; type: string; packets: number }[];
  estimated_bitrate_kbps: number | null;
  bytes_read: number;
  http_status: number | null;
  server_header: string | null;
};
