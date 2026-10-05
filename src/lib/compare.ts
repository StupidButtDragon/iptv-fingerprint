// Port of iptv_fingerprint/analysis/compare.py — side-by-side comparison of
// two saved scans with a weighted confidence score.
import type { DnsEntry, XtreamData } from "./types";

export type ComparableScan = {
  name: string;
  aliases?: string[];
  xtream: XtreamData;
  dns_entries: Record<string, DnsEntry>;
  server_software: string | null;
  cloudflare: boolean;
  a_records: string[];
};

type OverlapMatch = {
  overlap_pct: number;
  overlap: number;
  total: number;
  only_a: number;
  only_b: number;
  matched_samples: (string | number)[];
};

type SimilarityMatch = { similarity: number };

type DetailsMatch = { details: string[] };

export type MatchEntry = OverlapMatch | SimilarityMatch | DetailsMatch;

export type CompareReport = {
  provider_a: string;
  provider_b: string;
  verdict: string;
  confidence: number;
  matches: Record<string, MatchEntry>;
};

function splitIds(joined: string): Set<string> {
  return new Set(joined.split(",").filter(Boolean));
}

function isOverlap(m: MatchEntry): m is OverlapMatch {
  return "overlap_pct" in m;
}

function isSimilarity(m: MatchEntry): m is SimilarityMatch {
  return "similarity" in m;
}

function setOverlap(setA: Set<string>, setB: Set<string>): OverlapMatch {
  if (setA.size === 0 && setB.size === 0) {
    return { overlap_pct: 0, overlap: 0, total: 0, only_a: 0, only_b: 0, matched_samples: [] };
  }
  const intersection: string[] = [];
  for (const v of setA) if (setB.has(v)) intersection.push(v);
  const unionSize = setA.size + setB.size - intersection.length;
  const pct = unionSize > 0 ? (intersection.length / unionSize) * 100 : 0;
  return {
    overlap_pct: Math.round(pct * 10) / 10,
    overlap: intersection.length,
    total: unionSize,
    only_a: setA.size - intersection.length,
    only_b: setB.size - intersection.length,
    matched_samples: intersection.sort().slice(0, 10),
  };
}

function listSimilarity(a: string[], b: string[]): OverlapMatch {
  return setOverlap(new Set(a), new Set(b));
}

function orderSimilarity(a: string[], b: string[]): SimilarityMatch {
  if (a.length === 0 || b.length === 0) return { similarity: 0 };
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x));
  if (shared.length < 3) return { similarity: 0 };

  const indexB = new Map(b.map((name, i) => [name, i]));
  let inOrder = 0;
  let totalPairs = 0;
  for (let i = 0; i < shared.length - 1; i++) {
    const n1 = indexB.get(shared[i]);
    const n2 = indexB.get(shared[i + 1]);
    if (n1 !== undefined && n2 !== undefined) {
      totalPairs++;
      if (n1 < n2) inOrder++;
    }
  }
  const pct = totalPairs > 0 ? (inOrder / totalPairs) * 100 : 0;
  return { similarity: Math.round(pct * 10) / 10 };
}

function patternSimilarity(
  pa: XtreamData["naming_patterns"],
  pb: XtreamData["naming_patterns"],
): SimilarityMatch {
  if (!pa || !pb) return { similarity: 0 };
  let matches = 0;
  let checks = 0;
  for (const key of ["uses_pipes", "uses_brackets", "uses_unicode_stars", "uses_emoji"] as const) {
    if (key in pa && key in pb) {
      checks++;
      if (pa[key] === pb[key]) matches++;
    }
  }
  if (pa.separator_char && pb.separator_char) {
    checks++;
    if (pa.separator_char === pb.separator_char) matches++;
  }
  const pct = checks > 0 ? (matches / checks) * 100 : 0;
  return { similarity: Math.round(pct * 10) / 10 };
}

function compareInfrastructure(a: ComparableScan, b: ComparableScan): DetailsMatch {
  const details: string[] = [];

  const swA = a.server_software;
  const swB = b.server_software;
  if (swA && swB) {
    if (swA === swB) details.push(`Same server software: ${swA}`);
    else details.push(`Different servers: ${swA} vs ${swB}`);
  }

  if (a.cloudflare && b.cloudflare) details.push("Both behind Cloudflare");
  else if (a.cloudflare || b.cloudflare)
    details.push(`Only ${a.cloudflare ? "A" : "B"} behind Cloudflare`);

  const ipsA = new Set(a.a_records);
  const ipsB = new Set(b.a_records);
  const sharedIps = [...ipsA].filter((ip) => ipsB.has(ip));
  if (sharedIps.length > 0) details.push(`SHARED IPs: ${sharedIps.join(", ")}`);

  const orgA = firstOrg(a);
  const orgB = firstOrg(b);
  if (orgA && orgB && orgA === orgB) details.push(`Same hosting: ${orgA}`);

  return { details: details.length > 0 ? details : ["No infrastructure overlap detected"] };
}

function firstOrg(scan: ComparableScan): string {
  for (const entry of Object.values(scan.dns_entries)) {
    const info = entry?.dns?.ip_info ?? {};
    for (const value of Object.values(info)) {
      const org = (value as { org?: unknown } | undefined)?.org;
      if (typeof org === "string" && org) return org;
    }
  }
  return "";
}

export function compare(a: ComparableScan, b: ComparableScan): CompareReport {
  const report: CompareReport = {
    provider_a: a.name,
    provider_b: b.name,
    verdict: "",
    confidence: 0,
    matches: {},
  };

  const xtreamA = a.xtream;
  const xtreamB = b.xtream;

  report.matches.stream_ids = setOverlap(
    splitIds(xtreamA.stream_id_set),
    splitIds(xtreamB.stream_id_set),
  );
  report.matches.category_ids = setOverlap(
    splitIds(xtreamA.category_id_set),
    splitIds(xtreamB.category_id_set),
  );

  const namesA = xtreamA.categories.map((c) => c.category_name);
  const namesB = xtreamB.categories.map((c) => c.category_name);
  report.matches.category_names = listSimilarity(namesA, namesB);
  report.matches.category_ordering = orderSimilarity(namesA, namesB);
  report.matches.naming_patterns = patternSimilarity(
    xtreamA.naming_patterns,
    xtreamB.naming_patterns,
  );
  report.matches.logo_domains = setOverlap(
    new Set(xtreamA.logo_domains),
    new Set(xtreamB.logo_domains),
  );
  report.matches.epg_urls = setOverlap(new Set(xtreamA.epg_urls), new Set(xtreamB.epg_urls));
  report.matches.vod_library = setOverlap(
    new Set(xtreamA.vod_streams.map((v) => v.name).filter(Boolean)),
    new Set(xtreamB.vod_streams.map((v) => v.name).filter(Boolean)),
  );
  report.matches.infrastructure = compareInfrastructure(a, b);

  const weights: Record<string, number> = {
    stream_ids: 0.3,
    category_ids: 0.15,
    category_names: 0.1,
    category_ordering: 0.1,
    naming_patterns: 0.05,
    logo_domains: 0.1,
    epg_urls: 0.1,
    vod_library: 0.05,
    infrastructure: 0.05,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const match = report.matches[key];
    if (!match) continue;
    const pct = isOverlap(match)
      ? match.overlap_pct
      : isSimilarity(match)
        ? match.similarity
        : 0;
    score += pct * weight;
  }

  report.confidence = Math.round(score * 10) / 10;

  if (score >= 80)
    report.verdict = "SAME SOURCE - almost certainly the same upstream panel";
  else if (score >= 60) report.verdict = "LIKELY SAME SOURCE - strong indicators of shared upstream";
  else if (score >= 40)
    report.verdict = "POSSIBLY RELATED - some shared infrastructure or partial rebrand";
  else if (score >= 20)
    report.verdict = "WEAK RELATIONSHIP - minor overlaps, could be coincidence";
  else report.verdict = "DIFFERENT SOURCES - no significant overlap detected";

  return report;
}
