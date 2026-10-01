# Provider fingerprint database: the profiles shipped in known_providers.json,
# plus any the user has added with `promote` (stored in their data folder).
# New scans are compared against these to identify rebrands or shared sources.
import json
import os

from .. import config


def _read(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


KNOWN_PROVIDERS = {
    **_read(os.path.join(os.path.dirname(__file__), "known_providers.json")),
    **_read(config.USER_PROVIDERS),
}


def save_user_provider(provider_id, entry):
    """Add or replace a provider in the user's own provider file."""
    providers = _read(config.USER_PROVIDERS)
    providers[provider_id] = entry
    with open(config.USER_PROVIDERS, "w", encoding="utf-8") as f:
        json.dump(providers, f, indent=2, ensure_ascii=False)
    KNOWN_PROVIDERS[provider_id] = entry


def match_against_known(fingerprint_data):
    """
    Compare a fingerprint against all known providers.
    Returns a list of matches sorted by confidence.
    """
    matches = []

    xtream = fingerprint_data.get("xtream", {})
    dns_data = fingerprint_data.get("dns", {})
    headers_data = fingerprint_data.get("headers", {})

    scanned_stream_ids = set(xtream.get("stream_id_set", []))
    scanned_cat_ids = set(xtream.get("category_id_set", []))
    scanned_cat_names = [c.get("category_name", "") for c in xtream.get("categories", [])]
    scanned_logo_domains = set(xtream.get("logo_domains", []))
    scanned_domain = dns_data.get("domain", "")
    scanned_ips = set(dns_data.get("a_records", []))
    scanned_patterns = xtream.get("naming_patterns", {})

    for provider_id, known in KNOWN_PROVIDERS.items():
        score = 0.0
        signals = []

        # DNS match (instant identification)
        if scanned_domain in known["known_dns"]:
            score += 40
            signals.append(f"DNS hostname matches known entry: {scanned_domain}")

        # Stream ID overlap
        known_stream_ids = set(known.get("sample_stream_ids", []))
        if known_stream_ids and scanned_stream_ids:
            overlap = scanned_stream_ids & known_stream_ids
            if overlap:
                pct = len(overlap) / len(known_stream_ids) * 100
                score += min(pct * 0.3, 30)
                signals.append(f"Stream ID overlap: {len(overlap)}/{len(known_stream_ids)} sample IDs match ({pct:.0f}%)")

        # Category ID overlap
        known_cat_ids = set(known.get("sample_category_ids", []))
        if known_cat_ids and scanned_cat_ids:
            overlap = scanned_cat_ids & known_cat_ids
            if overlap:
                pct = len(overlap) / len(known_cat_ids) * 100
                score += min(pct * 0.15, 15)
                signals.append(f"Category ID overlap: {len(overlap)}/{len(known_cat_ids)} ({pct:.0f}%)")

        # Category name ordering
        known_names = known.get("category_names_ordered", [])
        if known_names and scanned_cat_names:
            name_matches = sum(1 for n in known_names if n in scanned_cat_names)
            if name_matches > 0:
                pct = name_matches / len(known_names) * 100
                score += min(pct * 0.1, 10)
                signals.append(f"Category name matches: {name_matches}/{len(known_names)} ({pct:.0f}%)")

            # Check ordering of matched names
            if name_matches >= 3:
                order_score = _check_ordering(known_names, scanned_cat_names)
                if order_score > 70:
                    score += 5
                    signals.append(f"Category ordering matches ({order_score:.0f}% in order)")

        # Naming pattern match
        known_pattern = known.get("naming_pattern", {})
        if known_pattern and scanned_patterns:
            pattern_matches = 0
            pattern_checks = 0
            for key in ["uses_pipes", "uses_brackets", "uses_unicode_stars"]:
                if key in known_pattern and key in scanned_patterns:
                    pattern_checks += 1
                    if known_pattern[key] == scanned_patterns[key]:
                        pattern_matches += 1
            if pattern_checks > 0:
                pct = pattern_matches / pattern_checks * 100
                if pct >= 80:
                    score += 3
                    signals.append(f"Naming pattern match: {pattern_matches}/{pattern_checks} attributes")

        # Logo domain overlap
        known_logos = set(known.get("logo_domains", []))
        if known_logos and scanned_logo_domains:
            overlap = scanned_logo_domains & known_logos
            if overlap:
                score += min(len(overlap) * 2, 8)
                signals.append(f"Shared logo domains: {', '.join(list(overlap)[:3])}")

        # Stream count range
        stream_range = known.get("stream_count_range", [])
        stream_count = len(xtream.get("streams", []))
        if stream_range and stream_count:
            if stream_range[0] <= stream_count <= stream_range[1]:
                score += 2
                signals.append(f"Stream count ({stream_count}) within expected range {stream_range}")

        # Server software
        known_sw = known.get("server_software", "")
        scanned_sw = headers_data.get("server_software", "")
        if known_sw and scanned_sw and known_sw.lower() == scanned_sw.lower():
            score += 1
            signals.append(f"Server software matches: {known_sw}")

        if score > 0:
            # Determine verdict
            if score >= 50:
                verdict = "MATCH"
            elif score >= 25:
                verdict = "LIKELY"
            elif score >= 10:
                verdict = "POSSIBLE"
            else:
                verdict = "WEAK"

            matches.append({
                "provider_id": provider_id,
                "display_name": known["display_name"],
                "score": round(score, 1),
                "verdict": verdict,
                "signals": signals,
            })

    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches


def print_known_match_report(matches, scanned_name):
    """Print the known provider match results."""
    print(f"\n{'=' * 60}")
    print(f"  KNOWN PROVIDER MATCHING: {scanned_name}")
    print(f"{'=' * 60}")

    if not matches:
        print(f"\n  No matches found against {len(KNOWN_PROVIDERS)} known providers.")
        print(f"  This appears to be an unknown/unique source.")
        return

    for m in matches:
        icon = {"MATCH": "***", "LIKELY": "**", "POSSIBLE": "*", "WEAK": "."}
        marker = icon.get(m["verdict"], ".")

        print(f"\n  {marker} {m['display_name']} [{m['verdict']}] (score: {m['score']})")
        for signal in m["signals"]:
            print(f"      {signal}")

    best = matches[0]
    print(f"\n  BEST MATCH: {best['display_name']} ({best['verdict']}, score: {best['score']})")
    print(f"{'=' * 60}\n")


def _check_ordering(known_names, scanned_names):
    """Check if known names appear in the same order in the scanned list."""
    scanned_index = {}
    for i, name in enumerate(scanned_names):
        if name not in scanned_index:
            scanned_index[name] = i

    shared = [n for n in known_names if n in scanned_index]
    if len(shared) < 2:
        return 0

    in_order = 0
    total = 0
    for i in range(len(shared) - 1):
        total += 1
        if scanned_index[shared[i]] < scanned_index[shared[i + 1]]:
            in_order += 1

    return (in_order / total * 100) if total > 0 else 0
