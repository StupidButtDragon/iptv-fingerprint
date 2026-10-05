// Port of iptv_fingerprint/collectors/* to TypeScript.
// Uses node:http/https directly (with TLS verification disabled, like the
// Python app's verify=False) because many IPTV panels use self-signed certs.
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

import { analyzeNaming } from "./naming";
import type {
  Category,
  ChannelRow,
  CertRecord,
  DnsEntry,
  DnsInfo,
  HeaderInfo,
  StreamSample,
  WhoisInfo,
  XtreamData,
} from "./types";

export type Log = (line: string) => Promise<void> | void;

const UA = "TiviMate/4.4.0 (Linux; Android 11)";

export type HttpResult = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  url: string;
};

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  redirectsLeft?: number;
};

export function httpRequest(rawUrl: string, opts: RequestOptions = {}): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  const redirectsLeft = opts.redirectsLeft ?? 4;

  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      reject(new Error(`Invalid URL: ${rawUrl}`));
      return;
    }
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;
    const req = mod.request(
      parsed,
      {
        method: opts.method ?? "GET",
        headers: { "User-Agent": UA, ...(opts.headers ?? {}) },
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        }

        if (status >= 300 && status < 400 && headers.location && redirectsLeft > 0) {
          res.resume();
          const next = new URL(headers.location, parsed).toString();
          resolve(httpRequest(next, { ...opts, redirectsLeft: redirectsLeft - 1 }));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({ status, headers, body: Buffer.concat(chunks), url: parsed.toString() });
        };
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          total += chunk.length;
          if (total >= maxBytes) {
            res.destroy();
            finish();
          }
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish);
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms: ${rawUrl}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T | null> {
  try {
    const res = await httpRequest(url, opts);
    if (res.status !== 200 || res.body.length === 0) return null;
    return JSON.parse(res.body.toString("utf-8")) as T;
  } catch {
    return null;
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Xtream API
// ---------------------------------------------------------------------------

type XtreamCollectResult = {
  xtream: XtreamData;
  channels: ChannelRow[];
  firstStreamId: string | null;
};

export async function xtreamCollect(
  serverUrl: string,
  username: string,
  password: string,
  log: Log,
): Promise<XtreamCollectResult> {
  const base = serverUrl.replace(/\/+$/, "");
  let apiType: string | null = null;
  let authData: Record<string, any> | null = null;

  for (const apiPath of ["player_api.php", "api.php"]) {
    try {
      const data = await getJson<Record<string, any>>(
        `${base}/${apiPath}?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        { timeoutMs: 15000, maxBytes: 4 * 1024 * 1024 },
      );
      if (data && typeof data === "object" && !Array.isArray(data) && "user_info" in data) {
        authData = data;
        apiType = apiPath;
        break;
      }
      if (data && typeof data === "object" && (data as any).result === false) {
        await log(`  [!] ${apiPath}: ${(data as any)["0"] ?? "rejected"}`);
      }
    } catch {
      continue;
    }
  }

  if (!authData || !apiType) {
    throw new Error(`Could not authenticate with ${base}`);
  }

  await log(`  [+] Authenticated via ${apiType}`);
  await log(`  [+] Server: ${authData.server_info?.url ?? "unknown"}`);
  await log(`  [+] Timezone: ${authData.server_info?.timezone ?? "unknown"}`);

  const apiBase = `${base}/${apiType}`;
  const authQuery = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const apiGet = async (action: string, timeoutMs: number): Promise<unknown> => {
    try {
      const res = await httpRequest(`${apiBase}?${authQuery}&action=${action}`, {
        timeoutMs,
        maxBytes: 64 * 1024 * 1024,
      });
      if (res.status === 200 && res.body.length > 0) {
        return JSON.parse(res.body.toString("utf-8"));
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  const toCategories = (raw: unknown): Category[] =>
    Array.isArray(raw)
      ? raw.map((c: any) => ({
          category_id: String(c?.category_id ?? ""),
          category_name: String(c?.category_name ?? ""),
        }))
      : [];

  await log("  [.] Fetching live categories...");
  const categories = toCategories(await apiGet("get_live_categories", 30000));

  await log("  [.] Fetching live streams...");
  const rawStreams = await apiGet("get_live_streams", 60000);
  const streams: any[] = Array.isArray(rawStreams) ? rawStreams : [];

  const categoryIdSet = new Set<string>();
  for (const c of categories) categoryIdSet.add(c.category_id);

  const streamIdSet = new Set<string>();
  const logoDomains = new Set<string>();
  const channels: ChannelRow[] = [];

  const catLookup = new Map<string, string>();
  for (const c of categories) catLookup.set(c.category_id, c.category_name);

  for (const s of streams) {
    streamIdSet.add(String(s?.stream_id ?? ""));
    const logo = String(s?.stream_icon ?? "");
    if (logo) {
      const host = hostnameOf(logo);
      if (host) logoDomains.add(host);
    }
    const catId = String(s?.category_id ?? "");
    channels.push({
      category_id: catId,
      category_name: catLookup.get(catId) ?? "Uncategorized",
      stream_id: String(s?.stream_id ?? ""),
      channel_name: String(s?.name ?? ""),
      epg_channel_id: String(s?.epg_channel_id ?? ""),
      stream_icon: logo,
    });
  }

  await log("  [.] Fetching VOD categories...");
  const vodCategories = toCategories(await apiGet("get_vod_categories", 30000));

  await log("  [.] Fetching VOD streams...");
  const rawVod = await apiGet("get_vod_streams", 60000);
  const vodAll: any[] = Array.isArray(rawVod) ? rawVod : [];
  const vodStreams = vodAll.slice(0, 500).map((v: any) => ({ name: String(v?.name ?? "") }));

  await log("  [.] Fetching series categories...");
  const seriesCategories = toCategories(await apiGet("get_series_categories", 30000));

  await log("  [.] Checking M3U for EPG URLs...");
  const epgUrls = await extractEpgUrls(base, username, password);

  const naming = analyzeNaming(categories);

  channels.sort((a, b) => {
    const ca = a.category_name || "ZZZ_Uncategorized";
    const cb = b.category_name || "ZZZ_Uncategorized";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.channel_name < b.channel_name ? -1 : a.channel_name > b.channel_name ? 1 : 0;
  });

  const xtream: XtreamData = {
    api_type: apiType,
    server_info: (authData.server_info ?? {}) as Record<string, unknown>,
    user_info: (authData.user_info ?? {}) as Record<string, unknown>,
    categories,
    category_count: categories.length,
    stream_count: streams.length,
    stream_id_set: [...streamIdSet].sort().join(","),
    category_id_set: [...categoryIdSet].sort().join(","),
    logo_domains: [...logoDomains].sort(),
    epg_urls: epgUrls,
    naming_patterns: naming,
    vod_categories: vodCategories,
    vod_stream_count: vodAll.length,
    vod_streams: vodStreams,
    series_categories: seriesCategories,
  };

  await log(
    `  [+] Collected: ${categories.length} categories, ${streams.length} streams, ` +
      `${vodCategories.length} VOD categories, ${vodAll.length} VOD items, ` +
      `${seriesCategories.length} series categories`,
  );
  await log(`  [+] Logo domains: ${[...logoDomains].slice(0, 5).join(", ") || "none found"}`);
  await log(`  [+] EPG URLs: ${epgUrls.slice(0, 3).join(", ") || "none found"}`);

  return { xtream, channels, firstStreamId: streams[0] ? String(streams[0]?.stream_id ?? "") : null };
}

async function extractEpgUrls(
  serverUrl: string,
  username: string,
  password: string,
): Promise<string[]> {
  const url =
    `${serverUrl}/get.php?username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
  try {
    const res = await httpRequest(url, { timeoutMs: 15000, maxBytes: 2048 });
    if (res.status === 200) {
      const head = res.body.toString("utf-8");
      const match = /url-tvg="([^"]+)"/.exec(head);
      if (match) return [match[1]];
    }
  } catch {
    /* ignore */
  }
  return [];
}

// ---------------------------------------------------------------------------
// Stream sample (MPEG-TS PID analysis)
// ---------------------------------------------------------------------------

export function redactStreamUrl(url: string): string {
  return url.replace(/(\/live\/)[^/]+\/[^/]+(\/\d+\.ts)/, "$1***/***/$2");
}

function classifyPid(pid: number): string {
  if (pid === 0) return "PAT";
  if (pid === 1) return "CAT";
  if (pid === 0x11) return "SDT/BAT";
  if (pid === 0x12) return "EIT";
  if (pid === 0x14) return "TDT/TOT";
  if (pid === 0x1fff) return "null";
  if (pid < 0x20) return `reserved(${pid})`;
  return "data";
}

export async function collectStreamSample(streamUrl: string, log: Log): Promise<StreamSample> {
  const result: StreamSample = {
    url_pattern: redactStreamUrl(streamUrl),
    reachable: false,
    content_type: null,
    is_ts: false,
    pids_found: [],
    estimated_bitrate_kbps: null,
    bytes_read: 0,
    http_status: null,
    server_header: null,
  };

  await log("  [.] Analyzing stream...");
  try {
    const res = await httpRequest(streamUrl, { timeoutMs: 12000, maxBytes: 256 * 1024 });
    result.http_status = res.status;
    result.content_type = res.headers["content-type"] ?? null;
    result.server_header = res.headers["server"] ?? null;
    result.bytes_read = res.body.length;

    if (res.status !== 200) {
      await log(`  [-] HTTP ${res.status}`);
      return result;
    }
    result.reachable = true;

    const data = res.body;
    if (data.length < 188) {
      await log(`  [-] Too little data (${data.length} bytes)`);
      return result;
    }
    if (data[0] !== 0x47) {
      await log(`  [-] Not MPEG-TS (first byte: 0x${data[0].toString(16)})`);
      return result;
    }
    result.is_ts = true;

    const pids = new Map<number, { count: number; type: string }>();
    let packetCount = 0;
    for (let offset = 0; offset + 188 <= data.length; offset += 188) {
      if (data[offset] !== 0x47) continue;
      packetCount++;
      const pid = ((data[offset + 1] & 0x1f) << 8) | data[offset + 2];
      const entry = pids.get(pid);
      if (entry) entry.count++;
      else pids.set(pid, { count: 1, type: classifyPid(pid) });
    }

    result.pids_found = [...pids.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pid, info]) => ({ pid, type: info.type, packets: info.count }));

    if (packetCount > 10) {
      result.estimated_bitrate_kbps = Math.floor((data.length * 8) / 1024);
    }

    await log(`  [+] MPEG-TS: ${packetCount} packets, ${pids.size} unique PIDs`);
    for (const pidInfo of result.pids_found) {
      if (pidInfo.type !== "data") {
        await log(`  [+]   PID ${pidInfo.pid}: ${pidInfo.type} (${pidInfo.packets} packets)`);
      }
    }
  } catch (err) {
    await log(`  [-] Stream fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Headers & SSL
// ---------------------------------------------------------------------------

function detectCdn(headers: Record<string, string>): string | null {
  const checks: [string, string | null][] = [
    ["cf-ray", "Cloudflare"],
    ["x-amz-cf-id", "AWS CloudFront"],
    ["x-amz-cf-pop", "AWS CloudFront"],
    ["x-cache", null],
    ["x-served-by", null],
    ["x-cdn", null],
  ];
  for (const [key, cdnName] of checks) {
    const val = headers[key];
    if (!val) continue;
    if (cdnName) return cdnName;
    const lower = val.toLowerCase();
    if (lower.includes("cloudfront")) return "AWS CloudFront";
    if (lower.includes("fastly")) return "Fastly";
    if (lower.includes("varnish")) return "Varnish";
    if (lower.includes("akamai")) return "Akamai";
    if (lower.includes("bunny") || lower.includes("b-cdn")) return "BunnyCDN";
    if (lower.includes("stackpath")) return "StackPath";
  }
  const server = (headers["server"] ?? "").toLowerCase();
  if (server.includes("cloudflare")) return "Cloudflare";
  if (server.includes("litespeed")) return "LiteSpeed";
  return null;
}

function formatCertName(name: tls.PeerCertificate["subject"]): string {
  return Object.entries(name ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

type SslCertInfo = {
  subject: string;
  issuer: string;
  sans: string[];
  not_before: string;
  not_after: string;
};

function getSslCert(hostname: string, port: number, timeoutMs = 5000): Promise<SslCertInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: SslCertInfo | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const socket = tls.connect(
        { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          if (!cert || !cert.subject) return done(null);
          const sans = String(cert.subjectaltname ?? "")
            .split(",")
            .map((s) => s.trim().replace(/^DNS:/, ""))
            .filter(Boolean);
          done({
            subject: formatCertName(cert.subject),
            issuer: formatCertName(cert.issuer),
            sans,
            not_before: cert.valid_from ?? "",
            not_after: cert.valid_to ?? "",
          });
        },
      );
      socket.on("error", () => done(null));
      socket.on("timeout", () => {
        socket.destroy();
        done(null);
      });
    } catch {
      done(null);
    }
  });
}

export async function headersCollect(serverUrl: string, log: Log): Promise<HeaderInfo> {
  const base = serverUrl.replace(/\/+$/, "");
  let hostname = "";
  let port = 80;
  try {
    const parsed = new URL(base.includes("://") ? base : `http://${base}`);
    hostname = parsed.hostname;
    port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  } catch {
    /* leave defaults */
  }

  const result: HeaderInfo = {
    url: base,
    hostname,
    port,
    server_software: null,
    cloudflare: false,
    cf_ray: null,
    cdn_detected: null,
    http_headers: {},
    ssl_sans: [],
    ssl_issuer: null,
    ssl_subject: null,
    ssl_not_before: null,
    ssl_not_after: null,
  };

  await log(`  [.] Fetching HTTP headers from ${base}...`);
  try {
    let res = await httpRequest(base, { method: "HEAD", timeoutMs: 10000, maxBytes: 64 * 1024 });
    if (res.status >= 500) {
      res = await httpRequest(base, { method: "GET", timeoutMs: 10000, maxBytes: 64 * 1024 });
    }
    const hdrs = res.headers;
    const kept: Record<string, string> = {};
    for (const [k, v] of Object.entries(hdrs)) {
      if (Object.keys(kept).length >= 40) break;
      kept[k] = v.slice(0, 500);
    }
    result.http_headers = kept;
    result.server_software = hdrs["server"] ?? null;

    const cfRay = hdrs["cf-ray"];
    if (cfRay) {
      result.cloudflare = true;
      result.cf_ray = cfRay;
      const dc = cfRay.includes("-") ? cfRay.split("-").pop() : "";
      await log(`  [+] Cloudflare detected (edge: ${dc})`);
    }

    const cdn = detectCdn(hdrs);
    if (cdn) {
      result.cdn_detected = cdn;
      await log(`  [+] CDN: ${cdn}`);
    }
    if (result.server_software) await log(`  [+] Server: ${result.server_software}`);
  } catch (err) {
    await log(`  [-] HTTP request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Probe common panel ports for extra fingerprints
  for (const panelPort of [8080, 8443, 25461]) {
    if (panelPort === port) continue;
    try {
      const res = await httpRequest(`http://${hostname}:${panelPort}`, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0" },
        timeoutMs: 5000,
        maxBytes: 16 * 1024,
      });
      if (res.status < 500) {
        const server = res.headers["server"] ?? "";
        result.panel_fingerprint = {
          port: panelPort,
          server,
          status: res.status,
          content_type: res.headers["content-type"] ?? "",
        };
        await log(
          `  [+] Panel detected on port ${panelPort}: ${server || "unknown"} (HTTP ${res.status})`,
        );
        break;
      }
    } catch {
      continue;
    }
  }

  for (const sslPort of [443, 8443]) {
    const cert = await getSslCert(hostname, sslPort);
    if (cert) {
      result.ssl_sans = cert.sans;
      result.ssl_issuer = cert.issuer;
      result.ssl_subject = cert.subject;
      result.ssl_not_before = cert.not_before;
      result.ssl_not_after = cert.not_after;
      if (cert.sans.length > 0) await log(`  [+] SSL SANs (${sslPort}): ${cert.sans.slice(0, 5).join(", ")}`);
      if (cert.issuer) await log(`  [+] SSL Issuer: ${cert.issuer}`);
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// DNS & network
// ---------------------------------------------------------------------------

const DNS_TYPES: Record<string, number> = { A: 1, NS: 2, MX: 15, TXT: 16 };

async function doh(domain: string, type: string): Promise<string[]> {
  const data = await getJson<{ Answer?: { type: number; data: string }[] }>(
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
    { timeoutMs: 10000, maxBytes: 256 * 1024 },
  );
  const answers = data?.Answer ?? [];
  return answers
    .filter((a) => a.type === DNS_TYPES[type])
    .map((a) => String(a.data).trim().replace(/\.$/, ""));
}

async function ipInfo(ip: string): Promise<Record<string, unknown> | null> {
  return getJson<Record<string, unknown>>(`https://ipinfo.io/${ip}/json`, {
    timeoutMs: 10000,
    maxBytes: 128 * 1024,
  });
}

async function crtSh(domain: string): Promise<CertRecord[]> {
  try {
    const res = await httpRequest(
      `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`,
      { timeoutMs: 30000, maxBytes: 8 * 1024 * 1024, headers: { "User-Agent": "iptv-fingerprint/1.0" } },
    );
    if (res.status !== 200) return [];
    const certs = JSON.parse(res.body.toString("utf-8")) as any[];
    if (!Array.isArray(certs)) return [];
    const seen = new Set<unknown>();
    const results: CertRecord[] = [];
    for (const cert of certs) {
      if (results.length >= 50) break;
      const certId = cert?.id;
      if (seen.has(certId)) continue;
      seen.add(certId);
      const nameValue = String(cert?.name_value ?? "");
      const names = nameValue
        .split("\n")
        .map((n: string) => n.trim().toLowerCase())
        .filter((n: string) => n && !n.includes("*"));
      results.push({
        id: certId ?? "",
        issuer: String(cert?.issuer_name ?? ""),
        not_before: String(cert?.not_before ?? ""),
        not_after: String(cert?.not_after ?? ""),
        common_name: String(cert?.common_name ?? ""),
        names,
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function reverseIp(ip: string, ipHostname: string): Promise<string[]> {
  const domains: string[] = [];
  if (ipHostname && ipHostname !== ip) domains.push(ipHostname);
  try {
    const res = await httpRequest(
      `https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`,
      { timeoutMs: 10000, maxBytes: 64 * 1024 },
    );
    if (res.status === 200) {
      const text = res.body.toString("utf-8");
      if (!text.toLowerCase().includes("error") && !text.includes("API count")) {
        for (const line of text.split("\n")) {
          const d = line.trim();
          if (d && d !== ip) domains.push(d);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(domains)].sort();
}

export async function dnsCollect(domain: string, log: Log): Promise<DnsInfo> {
  await log(`  [.] Resolving DNS for ${domain}...`);

  const aRecords = await doh(domain, "A");
  await log(`  [+] A records: ${aRecords.join(", ") || "none"}`);

  const mxRecords = await doh(domain, "MX");
  if (mxRecords.length > 0) await log(`  [+] MX records: ${mxRecords.join(", ")}`);
  const nsRecords = await doh(domain, "NS");
  const txtRecords = await doh(domain, "TXT");

  const ipInfoMap: Record<string, unknown> = {};
  for (const ip of aRecords.slice(0, 3)) {
    const info = await ipInfo(ip);
    if (info) {
      ipInfoMap[ip] = info;
      const org = (info.org as string) ?? "unknown";
      const loc = `${(info.city as string) ?? ""}, ${(info.country as string) ?? ""}`;
      await log(`  [+] ${ip}: ${org} (${loc})`);
    }
  }

  await log("  [.] Querying crt.sh for certificate history...");
  const crt = await crtSh(domain);
  if (crt.length > 0) {
    const uniqueNames = new Set<string>();
    for (const cert of crt) for (const n of cert.names) uniqueNames.add(n);
    await log(`  [+] crt.sh: ${crt.length} certs, ${uniqueNames.size} unique hostnames`);
  } else {
    await log("  [-] crt.sh: no results");
  }

  let reverseDomains: string[] = [];
  if (aRecords.length > 0) {
    const primaryIp = aRecords[0];
    await log(`  [.] Reverse IP lookup for ${primaryIp}...`);
    const primaryInfo = ipInfoMap[primaryIp] as { hostname?: string } | undefined;
    reverseDomains = await reverseIp(primaryIp, primaryInfo?.hostname ?? "");
    if (reverseDomains.length > 0) {
      await log(`  [+] Found ${reverseDomains.length} other domains on same IP`);
    } else {
      await log("  [-] No reverse IP results");
    }
  }

  return {
    domain,
    a_records: aRecords,
    mx_records: mxRecords,
    ns_records: nsRecords,
    txt_records: txtRecords,
    ip_info: ipInfoMap,
    crt_sh: crt,
    reverse_ip_domains: reverseDomains,
  };
}

// ---------------------------------------------------------------------------
// WHOIS (RDAP)
// ---------------------------------------------------------------------------

const PRIVACY_KEYWORDS = [
  "privacy",
  "redacted",
  "whoisguard",
  "domains by proxy",
  "contact privacy",
  "withheld",
];

export async function whoisCollect(domain: string): Promise<WhoisInfo> {
  const result: WhoisInfo = {
    domain,
    registrar: null,
    creation_date: null,
    expiry_date: null,
    updated_date: null,
    nameservers: [],
    registrant_country: null,
    privacy_protected: false,
  };

  let raw = "";
  try {
    const res = await httpRequest(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      timeoutMs: 12000,
      maxBytes: 1024 * 1024,
      headers: { Accept: "application/json" },
    });
    if (res.status !== 200) return result;
    raw = res.body.toString("utf-8");
    const data = JSON.parse(raw) as any;

    const events: Record<string, string> = {};
    for (const e of data.events ?? []) events[e.eventAction] = e.eventDate;
    result.creation_date = events["registration"] ?? null;
    result.expiry_date = events["expiration"] ?? null;
    result.updated_date = events["last changed"] ?? null;
    result.nameservers = (data.nameservers ?? []).map((ns: any) =>
      String(ns.ldhName ?? "").toLowerCase().replace(/\.$/, ""),
    );

    for (const entity of data.entities ?? []) {
      const vcard = entity.vcardArray?.[1] ?? [];
      const fields: Record<string, string> = {};
      for (const f of vcard) if (Array.isArray(f) && f.length > 3) fields[f[0]] = String(f[3]);
      if ((entity.roles ?? []).includes("registrar")) result.registrar = fields.fn ?? null;
      if ((entity.roles ?? []).includes("registrant")) {
        const adr = fields.adr;
        if (typeof adr === "string" && adr) {
          const parts = adr.split(",");
          const country = parts[parts.length - 1]?.trim();
          if (country) result.registrant_country = country;
        }
      }
    }
  } catch {
    return result;
  }

  const lower = raw.toLowerCase();
  result.privacy_protected = PRIVACY_KEYWORDS.some((kw) => lower.includes(kw));
  return result;
}

// ---------------------------------------------------------------------------
// OSINT
// ---------------------------------------------------------------------------

export type OsintResult = {
  shodan_internetdb: Record<string, unknown> | null;
  censys: Record<string, unknown> | null;
  urlscan: Record<string, unknown>[] | null;
};

export async function osintCollect(
  ip: string,
  domain: string,
  censysKey: string,
  urlscanKey: string,
  log: Log,
): Promise<OsintResult> {
  const result: OsintResult = {
    shodan_internetdb: null,
    censys: null,
    urlscan: null,
  };

  await log(`  [.] Querying Shodan InternetDB for ${ip}...`);
  try {
    const res = await httpRequest(`https://internetdb.shodan.io/${ip}`, { timeoutMs: 15000 });
    if (res.status === 200) {
      const data = JSON.parse(res.body.toString("utf-8")) as any;
      result.shodan_internetdb = {
        ip,
        ports: data.ports ?? [],
        hostnames: data.hostnames ?? [],
        cpes: data.cpes ?? [],
        vulns: data.vulns ?? [],
        tags: data.tags ?? [],
      };
      const ports = (data.ports ?? []) as unknown[];
      await log(`  [+] InternetDB: ${ports.length} open ports: ${ports.join(", ")}`);
      if ((data.hostnames ?? []).length > 0)
        await log(`  [+] Hostnames: ${(data.hostnames as string[]).slice(0, 5).join(", ")}`);
      if ((data.cpes ?? []).length > 0)
        await log(`  [+] CPEs: ${(data.cpes as string[]).slice(0, 5).join(", ")}`);
      if ((data.vulns ?? []).length > 0)
        await log(`  [+] Known vulns: ${(data.vulns as unknown[]).length}`);
    } else if (res.status === 404) {
      await log("  [-] InternetDB: no data for " + ip);
    } else {
      await log(`  [-] InternetDB: HTTP ${res.status}`);
    }
  } catch (err) {
    await log(`  [-] InternetDB error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (censysKey) {
    await log(`  [.] Querying Censys for ${ip}...`);
    try {
      const res = await httpRequest(`https://api.platform.censys.io/v2/hosts/${ip}`, {
        timeoutMs: 15000,
        headers: { Authorization: `Bearer ${censysKey}` },
      });
      if (res.status === 200) {
        const host = JSON.parse(res.body.toString("utf-8")).result ?? {};
        const services = (host.services ?? []).map((svc: any) => {
          const serviceInfo: Record<string, unknown> = {
            port: svc.port,
            service_name: svc.service_name ?? "",
            transport: svc.transport_protocol ?? "",
          };
          const leaf = svc.tls?.certificates?.leaf;
          if (leaf) {
            serviceInfo.tls_subject = leaf.subject_dn ?? "";
            serviceInfo.tls_issuer = leaf.issuer_dn ?? "";
          }
          const httpResp = svc.http?.response;
          if (httpResp) {
            serviceInfo.http_status = httpResp.status_code;
            serviceInfo.http_title = httpResp.html_title ?? "";
          }
          return serviceInfo;
        });
        result.censys = {
          ip,
          services,
          as_name: host.autonomous_system?.name ?? "",
          as_number: host.autonomous_system?.asn ?? null,
          country: host.location?.country ?? "",
          city: host.location?.city ?? "",
        };
        await log(`  [+] Censys: ${services.length} services found`);
        await log(`  [+] Censys AS: ${result.censys.as_name} (AS${result.censys.as_number})`);
      } else if (res.status === 404) {
        await log(`  [-] Censys: no data for ${ip}`);
      } else {
        await log(`  [-] Censys: HTTP ${res.status}`);
      }
    } catch (err) {
      await log(`  [-] Censys error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    await log("  [.] Censys: skipped (no API key)");
  }

  if (urlscanKey && domain) {
    await log(`  [.] Searching urlscan.io for ${domain}...`);
    try {
      const res = await httpRequest(
        `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`domain:${domain}`)}&size=5`,
        { timeoutMs: 15000, headers: { "API-Key": urlscanKey } },
      );
      if (res.status === 200) {
        const data = JSON.parse(res.body.toString("utf-8"));
        const scans = (data.results ?? []).map((r: any) => ({
          url: r.page?.url ?? "",
          domain: r.page?.domain ?? "",
          ip: r.page?.ip ?? "",
          server: r.page?.server ?? "",
          title: r.task?.reportURL ?? "",
          time: r.task?.time ?? "",
          asn: r.page?.asn ?? "",
          asnname: r.page?.asnname ?? "",
        }));
        result.urlscan = scans.length > 0 ? scans : null;
        if (scans.length > 0) {
          await log(`  [+] urlscan.io: ${scans.length} existing scans found`);
          for (const s of scans.slice(0, 3)) {
            await log(`  [+]   ${s.url} (${s.server || "unknown"}) - ${s.time}`);
          }
        } else {
          await log("  [-] urlscan.io: no existing scans");
        }
      } else {
        await log(`  [-] urlscan.io: HTTP ${res.status}`);
      }
    } catch (err) {
      await log(`  [-] urlscan.io error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    await log("  [.] urlscan.io: skipped (no API key)");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Full domain investigation (headers + dns + whois + osint)
// ---------------------------------------------------------------------------

export async function investigateDomain(
  domain: string,
  opts: { port?: number; whois?: boolean; log: Log; censysKey?: string; urlscanKey?: string },
): Promise<DnsEntry> {
  const log = opts.log;
  const entry: DnsEntry = {
    headers: await headersCollect(
      opts.port ? `http://${domain}:${opts.port}` : `http://${domain}`,
      log,
    ),
    dns: await dnsCollect(domain, log),
  };

  if (opts.whois) {
    await log("  [.] WHOIS lookup for " + domain + "...");
    entry.whois = await whoisCollect(domain);
    if (entry.whois.registrar) await log(`  [+] Registrar: ${entry.whois.registrar}`);
    if (entry.whois.creation_date) await log(`  [+] Created: ${entry.whois.creation_date}`);
    if (entry.whois.nameservers.length > 0)
      await log(`  [+] Nameservers: ${entry.whois.nameservers.slice(0, 4).join(", ")}`);
    if (entry.whois.privacy_protected) await log("  [+] Privacy protection: enabled");
  }

  const aRecords = entry.dns.a_records;
  if (aRecords.length > 0) {
    await log("  [.] OSINT:");
    entry.osint = await osintCollect(
      aRecords[0],
      domain,
      opts.censysKey ?? "",
      opts.urlscanKey ?? "",
      log,
    );
  }

  return entry;
}
