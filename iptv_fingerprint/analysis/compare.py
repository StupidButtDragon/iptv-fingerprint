def compare(fp_a, fp_b):
    """
    Compare two provider fingerprints and produce a match report.
    Returns a dict with match scores across multiple dimensions.
    """
    report = {
        "provider_a": fp_a.get("name", "Provider A"),
        "provider_b": fp_b.get("name", "Provider B"),
        "verdict": "",
        "confidence": 0.0,
        "matches": {},
    }

    xtream_a = fp_a.get("xtream", {})
    xtream_b = fp_b.get("xtream", {})

    # 1. Stream ID overlap (strongest signal)
    ids_a = set(xtream_a.get("stream_id_set", []))
    ids_b = set(xtream_b.get("stream_id_set", []))
    stream_id_match = _set_overlap(ids_a, ids_b)
    report["matches"]["stream_ids"] = stream_id_match

    # 2. Category ID overlap
    cat_ids_a = set(xtream_a.get("category_id_set", []))
    cat_ids_b = set(xtream_b.get("category_id_set", []))
    cat_id_match = _set_overlap(cat_ids_a, cat_ids_b)
    report["matches"]["category_ids"] = cat_id_match

    # 3. Category name similarity
    cat_names_a = [c.get("category_name", "") for c in xtream_a.get("categories", [])]
    cat_names_b = [c.get("category_name", "") for c in xtream_b.get("categories", [])]
    cat_name_match = _list_similarity(cat_names_a, cat_names_b)
    report["matches"]["category_names"] = cat_name_match

    # 4. Category ordering match
    order_match = _order_similarity(cat_names_a, cat_names_b)
    report["matches"]["category_ordering"] = order_match

    # 5. Naming pattern match
    patterns_a = xtream_a.get("naming_patterns", {})
    patterns_b = xtream_b.get("naming_patterns", {})
    pattern_match = _pattern_similarity(patterns_a, patterns_b)
    report["matches"]["naming_patterns"] = pattern_match

    # 6. Logo domain overlap
    logos_a = set(xtream_a.get("logo_domains", []))
    logos_b = set(xtream_b.get("logo_domains", []))
    logo_match = _set_overlap(logos_a, logos_b)
    report["matches"]["logo_domains"] = logo_match

    # 7. EPG URL overlap
    epg_a = set(xtream_a.get("epg_urls", []))
    epg_b = set(xtream_b.get("epg_urls", []))
    epg_match = _set_overlap(epg_a, epg_b)
    report["matches"]["epg_urls"] = epg_match

    # 8. VOD library overlap (by name)
    vod_a = set(v.get("name", "") for v in xtream_a.get("vod_streams", []) if v.get("name"))
    vod_b = set(v.get("name", "") for v in xtream_b.get("vod_streams", []) if v.get("name"))
    vod_match = _set_overlap(vod_a, vod_b)
    report["matches"]["vod_library"] = vod_match

    # 9. Infrastructure comparison
    infra_match = _compare_infrastructure(fp_a, fp_b)
    report["matches"]["infrastructure"] = infra_match

    # Calculate overall confidence
    weights = {
        "stream_ids": 0.30,
        "category_ids": 0.15,
        "category_names": 0.10,
        "category_ordering": 0.10,
        "naming_patterns": 0.05,
        "logo_domains": 0.10,
        "epg_urls": 0.10,
        "vod_library": 0.05,
        "infrastructure": 0.05,
    }

    score = 0.0
    for key, weight in weights.items():
        match = report["matches"].get(key, {})
        pct = match.get("overlap_pct", match.get("similarity", 0.0))
        score += pct * weight

    report["confidence"] = round(score, 1)

    if score >= 80:
        report["verdict"] = "SAME SOURCE - almost certainly the same upstream panel"
    elif score >= 60:
        report["verdict"] = "LIKELY SAME SOURCE - strong indicators of shared upstream"
    elif score >= 40:
        report["verdict"] = "POSSIBLY RELATED - some shared infrastructure or partial rebrand"
    elif score >= 20:
        report["verdict"] = "WEAK RELATIONSHIP - minor overlaps, could be coincidence"
    else:
        report["verdict"] = "DIFFERENT SOURCES - no significant overlap detected"

    return report


def print_report(report):
    """Print a formatted comparison report."""
    a = report["provider_a"]
    b = report["provider_b"]

    print("\n" + "=" * 70)
    print(f"  COMPARISON: {a} vs {b}")
    print("=" * 70)
    print(f"\n  VERDICT: {report['verdict']}")
    print(f"  CONFIDENCE: {report['confidence']}%\n")

    for key, match in report["matches"].items():
        label = key.replace("_", " ").title()

        if "overlap_pct" in match:
            pct = match["overlap_pct"]
            bar = _bar(pct)
            detail = f"{match.get('overlap', 0)}/{match.get('total', 0)} matches"
            print(f"  {label:25s} {bar} {pct:5.1f}%  ({detail})")

            # Show sample matches
            samples = match.get("matched_samples", [])
            if samples:
                for s in samples[:5]:
                    print(f"  {'':25s}   -> {s}")

        elif "similarity" in match:
            pct = match["similarity"]
            bar = _bar(pct)
            print(f"  {label:25s} {bar} {pct:5.1f}%")

        elif "details" in match:
            print(f"  {label:25s}")
            for detail in match["details"]:
                print(f"  {'':25s}   {detail}")

    print("\n" + "=" * 70)


def _set_overlap(set_a, set_b):
    """Calculate overlap between two sets."""
    if not set_a and not set_b:
        return {"overlap_pct": 0, "overlap": 0, "total": 0, "matched_samples": []}

    intersection = set_a & set_b
    union = set_a | set_b
    pct = (len(intersection) / len(union) * 100) if union else 0

    return {
        "overlap_pct": round(pct, 1),
        "overlap": len(intersection),
        "total": len(union),
        "only_a": len(set_a - set_b),
        "only_b": len(set_b - set_a),
        "matched_samples": sorted(list(intersection))[:10],
    }


def _list_similarity(list_a, list_b):
    """Calculate similarity between two ordered lists of strings."""
    set_a = set(list_a)
    set_b = set(list_b)
    return _set_overlap(set_a, set_b)


def _order_similarity(list_a, list_b):
    """Check if shared items appear in the same order."""
    if not list_a or not list_b:
        return {"similarity": 0}

    shared = [x for x in list_a if x in set(list_b)]
    if len(shared) < 3:
        return {"similarity": 0}

    # Check how many consecutive pairs maintain order in both lists
    index_b = {name: i for i, name in enumerate(list_b)}
    in_order = 0
    total_pairs = 0

    for i in range(len(shared) - 1):
        name_1 = shared[i]
        name_2 = shared[i + 1]
        if name_1 in index_b and name_2 in index_b:
            total_pairs += 1
            if index_b[name_1] < index_b[name_2]:
                in_order += 1

    pct = (in_order / total_pairs * 100) if total_pairs > 0 else 0
    return {"similarity": round(pct, 1)}


def _pattern_similarity(patterns_a, patterns_b):
    """Compare naming convention patterns."""
    if not patterns_a or not patterns_b:
        return {"similarity": 0}

    matches = 0
    checks = 0

    for key in ["uses_pipes", "uses_brackets", "uses_unicode_stars", "uses_emoji"]:
        if key in patterns_a and key in patterns_b:
            checks += 1
            if patterns_a[key] == patterns_b[key]:
                matches += 1

    if patterns_a.get("separator_char") and patterns_b.get("separator_char"):
        checks += 1
        if patterns_a["separator_char"] == patterns_b["separator_char"]:
            matches += 1

    pct = (matches / checks * 100) if checks > 0 else 0
    return {"similarity": round(pct, 1)}


def _compare_infrastructure(fp_a, fp_b):
    """Compare infrastructure data between two fingerprints."""
    details = []

    headers_a = fp_a.get("headers", {})
    headers_b = fp_b.get("headers", {})

    # Server software
    sw_a = headers_a.get("server_software", "")
    sw_b = headers_b.get("server_software", "")
    if sw_a and sw_b:
        if sw_a == sw_b:
            details.append(f"Same server software: {sw_a}")
        else:
            details.append(f"Different servers: {sw_a} vs {sw_b}")

    # Cloudflare
    cf_a = headers_a.get("cloudflare", False)
    cf_b = headers_b.get("cloudflare", False)
    if cf_a and cf_b:
        details.append("Both behind Cloudflare")
    elif cf_a or cf_b:
        details.append(f"Only {'A' if cf_a else 'B'} behind Cloudflare")

    # Shared IPs
    dns_a = fp_a.get("dns", {})
    dns_b = fp_b.get("dns", {})
    ips_a = set(dns_a.get("a_records", []))
    ips_b = set(dns_b.get("a_records", []))
    shared_ips = ips_a & ips_b
    if shared_ips:
        details.append(f"SHARED IPs: {', '.join(shared_ips)}")

    # Same hosting provider
    for ip_a, info_a in dns_a.get("ip_info", {}).items():
        for ip_b, info_b in dns_b.get("ip_info", {}).items():
            org_a = info_a.get("org", "")
            org_b = info_b.get("org", "")
            if org_a and org_b and org_a == org_b:
                details.append(f"Same hosting: {org_a}")

    return {"details": details if details else ["No infrastructure overlap detected"]}


def _bar(pct):
    """Generate a simple text progress bar."""
    filled = int(pct / 5)
    return "[" + "#" * filled + "." * (20 - filled) + "]"
