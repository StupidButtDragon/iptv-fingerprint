// Sanity checks for the ported matching + comparison logic.
// Run: bun scripts/check-logic.ts
import { builtinProviders } from "../src/lib/providers";
import { matchAgainstKnown, type MatchableScan } from "../src/lib/match";
import { compare, type ComparableScan } from "../src/lib/compare";
import type { XtreamData } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- 1. A scan cloned from the T-Rex profile must score a full MATCH ---
const trex = builtinProviders.trex;
const cloneScan: MatchableScan = {
  xtream: {
    stream_id_set: trex.sample_stream_ids.join(","),
    category_id_set: trex.sample_category_ids.join(","),
    categories: trex.category_names_ordered.map((n, i) => ({
      category_id: trex.sample_category_ids[i] ?? String(i),
      category_name: n,
    })),
    logo_domains: trex.logo_domains,
    naming_patterns: {
      uses_pipes: trex.naming_pattern.uses_pipes,
      uses_brackets: trex.naming_pattern.uses_brackets,
      uses_unicode_stars: trex.naming_pattern.uses_unicode_stars,
    },
    stream_count: Math.round((trex.stream_count_range[0] + trex.stream_count_range[1]) / 2),
  },
  primary_domain: trex.known_dns[0],
  server_software: trex.server_software,
};

const matches = matchAgainstKnown(cloneScan, builtinProviders);
const trexMatch = matches.find((m) => m.provider_id === "trex");
check("clone of trex profile produces a trex match", !!trexMatch);
check("trex is the top match", matches[0]?.provider_id === "trex", `got ${matches[0]?.provider_id}`);
check(
  "trex score is 114 (40 dns + 30 stream + 15 cat + 10 names + 5 order + 3 pattern + 8 logo + 2 count + 1 sw)",
  trexMatch?.score === 114,
  `got ${trexMatch?.score}`,
);
check("trex verdict is MATCH", trexMatch?.verdict === "MATCH", `got ${trexMatch?.verdict}`);
check("trex match has 9 signals", trexMatch?.signals.length === 9, `got ${trexMatch?.signals.length}`);

// --- 2. An empty scan matches nothing ---
const emptyScan: MatchableScan = {
  xtream: {
    stream_id_set: "",
    category_id_set: "",
    categories: [],
    logo_domains: [],
    naming_patterns: {
      uses_pipes: false,
      uses_brackets: false,
      uses_unicode_stars: false,
    },
    stream_count: 0,
  },
  primary_domain: "",
  server_software: null,
};
check(
  "empty scan matches nothing",
  matchAgainstKnown(emptyScan, builtinProviders).length === 0,
);

// --- 3. Domain-only match: 40 points -> POSSIBLE (no samples overlap) ---
const domainOnly: MatchableScan = {
  ...emptyScan,
  primary_domain: trex.known_dns[1],
};
const domainMatches = matchAgainstKnown(domainOnly, builtinProviders);
const domainTrex = domainMatches.find((m) => m.provider_id === "trex");
check("domain-only scan scores 40 against trex", domainTrex?.score === 40, `got ${domainTrex?.score}`);
// 40 points is a LIKELY verdict per the scoring table (25-49 = LIKELY).
check("domain-only verdict is LIKELY", domainTrex?.verdict === "LIKELY", `got ${domainTrex?.verdict}`);

// --- 4. compare(): identical scans -> high confidence ---
type FixtureOpts = {
  names?: string[];
  vod?: string[];
  bracketStyle?: boolean;
};

function fixtureScan(
  name: string,
  idPrefix: string,
  logos: string[],
  epg: string[],
  opts: FixtureOpts = {},
): ComparableScan {
  const names = opts.names ?? ["|US| News", "|US| Sports", "|UK| Entertainment", "|FR| Kids"];
  const vod = opts.vod ?? ["Movie A", "Movie B", "Movie C"];
  const brackets = opts.bracketStyle ?? false;
  const xtream: XtreamData = {
    api_type: "player_api.php",
    server_info: { timezone: "UTC" },
    user_info: {},
    categories: names.map((n, i) => ({ category_id: `${idPrefix}${i + 1}`, category_name: n })),
    category_count: 4,
    stream_count: 1000,
    stream_id_set: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${idPrefix}${n}`).join(","),
    category_id_set: [1, 2, 3, 4].map((n) => `${idPrefix}${n}`).join(","),
    logo_domains: logos,
    epg_urls: epg,
    naming_patterns: {
      uses_pipes: !brackets,
      uses_brackets: brackets,
      uses_emoji: false,
      uses_unicode_stars: false,
      separator_char: brackets ? "[]" : "|",
      country_code_style: brackets ? "bracket" : "pipe",
      sample_names: names.slice(0, 2),
    },
    vod_categories: [{ category_id: "v1", category_name: "Movies" }],
    vod_stream_count: vod.length,
    vod_streams: vod.map((name) => ({ name })),
    series_categories: [{ category_id: "s1", category_name: "Series" }],
  };
  return {
    name,
    xtream,
    dns_entries: {
      "line.example.com": {
        headers: {
          url: "http://line.example.com",
          hostname: "line.example.com",
          port: 80,
          server_software: "nginx",
          cloudflare: false,
          cf_ray: null,
          cdn_detected: null,
          http_headers: {},
          ssl_sans: [],
          ssl_issuer: null,
          ssl_subject: null,
          ssl_not_before: null,
          ssl_not_after: null,
        },
        dns: {
          domain: "line.example.com",
          a_records: ["203.0.113.10"],
          mx_records: [],
          ns_records: [],
          txt_records: [],
          ip_info: { "203.0.113.10": { org: "Example Hosting" } },
          crt_sh: [],
          reverse_ip_domains: [],
        },
      },
    },
    server_software: "nginx",
    cloudflare: false,
    a_records: ["203.0.113.10"],
  };
}

const identicalA = fixtureScan("a", "1", ["cdn.example.com"], ["http://epg.example.com/g.xml"]);
const identicalB = fixtureScan("b", "1", ["cdn.example.com"], ["http://epg.example.com/g.xml"]);
const sameReport = compare(identicalA, identicalB);
check(
  "identical scans -> confidence 95",
  sameReport.confidence === 95,
  `got ${sameReport.confidence}`,
);
check(
  "identical scans -> SAME SOURCE verdict",
  sameReport.verdict.startsWith("SAME SOURCE"),
  `got ${sameReport.verdict}`,
);

const otherScan = fixtureScan("c", "9", ["other-cdn.net"], ["http://guide.other.tv/xml"], {
  names: ["[DE] Nachrichten", "[DE] Sport", "[IT] Film"],
  vod: ["Totally Different Film"],
  bracketStyle: true,
});
const diffReport = compare(identicalA, otherScan);
check(
  "disjoint scans -> confidence under 20",
  diffReport.confidence < 20,
  `got ${diffReport.confidence}`,
);
check(
  "disjoint scans -> DIFFERENT SOURCES verdict",
  diffReport.verdict.startsWith("DIFFERENT SOURCES"),
  `got ${diffReport.verdict}`,
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
