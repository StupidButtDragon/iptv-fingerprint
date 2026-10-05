// Port of iptv_fingerprint/analysis/known_providers.py — score a scan against
// every known provider (built-in profiles + user-promoted ones).
import type { MatchResult, ProviderProfile } from "./types";

export type MatchableScan = {
  xtream: {
    stream_id_set: string;
    category_id_set: string;
    categories: { category_name: string }[];
    logo_domains: string[];
    naming_patterns: {
      uses_pipes?: boolean;
      uses_brackets?: boolean;
      uses_unicode_stars?: boolean;
    };
    stream_count: number;
  };
  primary_domain: string;
  server_software: string | null;
};

function splitIds(joined: string): Set<string> {
  return new Set(joined.split(",").filter(Boolean));
}

function checkOrdering(knownNames: string[], scannedNames: string[]): number {
  const scannedIndex = new Map<string, number>();
  scannedNames.forEach((name, i) => {
    if (!scannedIndex.has(name)) scannedIndex.set(name, i);
  });

  const shared = knownNames.filter((n) => scannedIndex.has(n));
  if (shared.length < 2) return 0;

  let inOrder = 0;
  const total = shared.length - 1;
  for (let i = 0; i < total; i++) {
    const a = scannedIndex.get(shared[i])!;
    const b = scannedIndex.get(shared[i + 1])!;
    if (a < b) inOrder++;
  }
  return total > 0 ? (inOrder / total) * 100 : 0;
}

export function matchAgainstKnown(
  scan: MatchableScan,
  providers: Record<string, ProviderProfile>,
): MatchResult[] {
  const matches: MatchResult[] = [];

  const scannedStreamIds = splitIds(scan.xtream.stream_id_set);
  const scannedCatIds = splitIds(scan.xtream.category_id_set);
  const scannedCatNames = scan.xtream.categories.map((c) => c.category_name);
  const scannedLogoDomains = new Set(scan.xtream.logo_domains);
  const scannedDomain = scan.primary_domain;
  const scannedPatterns = scan.xtream.naming_patterns;

  for (const [providerId, known] of Object.entries(providers)) {
    let score = 0;
    const signals: string[] = [];

    // DNS match (instant identification)
    if (scan.primary_domain && known.known_dns.includes(scannedDomain)) {
      score += 40;
      signals.push(`DNS hostname matches known entry: ${scannedDomain}`);
    }

    // Stream ID overlap
    const knownStreamIds = new Set(known.sample_stream_ids ?? []);
    if (knownStreamIds.size > 0 && scannedStreamIds.size > 0) {
      let overlap = 0;
      for (const id of knownStreamIds) if (scannedStreamIds.has(id)) overlap++;
      if (overlap > 0) {
        const pct = (overlap / knownStreamIds.size) * 100;
        score += Math.min(pct * 0.3, 30);
        signals.push(
          `Stream ID overlap: ${overlap}/${knownStreamIds.size} sample IDs match (${pct.toFixed(0)}%)`,
        );
      }
    }

    // Category ID overlap
    const knownCatIds = new Set(known.sample_category_ids ?? []);
    if (knownCatIds.size > 0 && scannedCatIds.size > 0) {
      let overlap = 0;
      for (const id of knownCatIds) if (scannedCatIds.has(id)) overlap++;
      if (overlap > 0) {
        const pct = (overlap / knownCatIds.size) * 100;
        score += Math.min(pct * 0.15, 15);
        signals.push(
          `Category ID overlap: ${overlap}/${knownCatIds.size} (${pct.toFixed(0)}%)`,
        );
      }
    }

    // Category name ordering
    const knownNames = known.category_names_ordered ?? [];
    if (knownNames.length > 0 && scannedCatNames.length > 0) {
      const nameMatches = knownNames.filter((n) => scannedCatNames.includes(n)).length;
      if (nameMatches > 0) {
        const pct = (nameMatches / knownNames.length) * 100;
        score += Math.min(pct * 0.1, 10);
        signals.push(
          `Category name matches: ${nameMatches}/${knownNames.length} (${pct.toFixed(0)}%)`,
        );

        if (nameMatches >= 3) {
          const orderScore = checkOrdering(knownNames, scannedCatNames);
          if (orderScore > 70) {
            score += 5;
            signals.push(`Category ordering matches (${orderScore.toFixed(0)}% in order)`);
          }
        }
      }
    }

    // Naming pattern match
    const knownPattern = known.naming_pattern;
    if (knownPattern && scannedPatterns) {
      let patternMatches = 0;
      let patternChecks = 0;
      for (const key of ["uses_pipes", "uses_brackets", "uses_unicode_stars"] as const) {
        if (key in knownPattern && key in scannedPatterns) {
          patternChecks++;
          if (knownPattern[key] === scannedPatterns[key]) patternMatches++;
        }
      }
      if (patternChecks > 0) {
        const pct = (patternMatches / patternChecks) * 100;
        if (pct >= 80) {
          score += 3;
          signals.push(`Naming pattern match: ${patternMatches}/${patternChecks} attributes`);
        }
      }
    }

    // Logo domain overlap
    const knownLogos = new Set(known.logo_domains ?? []);
    if (knownLogos.size > 0 && scannedLogoDomains.size > 0) {
      const shared = [...knownLogos].filter((d) => scannedLogoDomains.has(d));
      if (shared.length > 0) {
        score += Math.min(shared.length * 2, 8);
        signals.push(`Shared logo domains: ${shared.slice(0, 3).join(", ")}`);
      }
    }

    // Stream count range
    const streamRange = known.stream_count_range ?? [];
    const streamCount = scan.xtream.stream_count;
    if (streamRange.length === 2 && streamCount > 0) {
      if (streamRange[0] <= streamCount && streamCount <= streamRange[1]) {
        score += 2;
        signals.push(
          `Stream count (${streamCount}) within expected range [${streamRange[0]}, ${streamRange[1]}]`,
        );
      }
    }

    // Server software
    const knownSw = known.server_software;
    const scannedSw = scan.server_software;
    if (knownSw && scannedSw && knownSw.toLowerCase() === scannedSw.toLowerCase()) {
      score += 1;
      signals.push(`Server software matches: ${knownSw}`);
    }

    if (score > 0) {
      let verdict = "WEAK";
      if (score >= 50) verdict = "MATCH";
      else if (score >= 25) verdict = "LIKELY";
      else if (score >= 10) verdict = "POSSIBLE";

      matches.push({
        provider_id: providerId,
        display_name: known.display_name,
        score: Math.round(score * 10) / 10,
        verdict,
        signals,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}
