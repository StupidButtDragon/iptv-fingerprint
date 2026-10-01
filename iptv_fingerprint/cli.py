"""
IPTV Provider Fingerprint Tool

Collects, stores, and compares provider fingerprints to identify
rebrands, shared sources, and infrastructure relationships.

Usage:
    iptv-fingerprint collect --name "ProviderX" --url http://server.com --user X --pass Y
    iptv-fingerprint compare --a "ProviderX" --b "ProviderY"
    iptv-fingerprint investigate --domain server.com
    iptv-fingerprint list
    iptv-fingerprint delete --name "ProviderX"
    iptv-fingerprint web            (browser UI; also the default with no arguments)
"""

import argparse
import os
import sys
import warnings
from urllib.parse import urlparse

# Suppress SSL warnings for self-signed certs
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

from . import config
from .collectors import xtream, dns, headers, osint, whois_lookup, stream
from .analysis import compare, signature
from .analysis.known_providers import KNOWN_PROVIDERS, match_against_known, print_known_match_report, save_user_provider


def _load(name):
    """Load a saved fingerprint or exit with the available names."""
    try:
        return signature.load_fingerprint(name)
    except KeyError as e:
        sys.exit(f"\n  Error: {e}")


def _split_csv(s):
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def _parse_domains(s):
    """Comma-separated domains or full URLs -> unique lowercase hostnames."""
    domains = []
    for d in _split_csv(s.lower() if s else s):
        if "://" in d:
            d = urlparse(d).hostname or d
        d = d.split(":")[0]
        if d and d not in domains:
            domains.append(d)
    return domains


def _investigate(domain, port=None, whois=True):
    """Headers/SSL, DNS, optional WHOIS, and OSINT for one domain."""
    entry = {}

    print(f"  --- Headers & SSL ---")
    entry["headers"] = headers.collect(f"http://{domain}:{port}" if port else f"http://{domain}")

    print(f"  --- DNS & Network ---")
    entry["dns"] = dns.collect(domain)

    if whois:
        print(f"  --- WHOIS ---")
        entry["whois"] = whois_lookup.collect(domain)

    a_records = entry["dns"]["a_records"]
    if a_records:
        print(f"  --- OSINT ---")
        entry["osint"] = osint.collect(
            ip=a_records[0],
            domain=domain,
            censys_key=config.CENSYS_API_KEY,
            urlscan_key=config.URLSCAN_API_KEY,
        )

    return entry


def _print_row(domain, entry, prefix="", tag=""):
    """One summary line per DNS entry: domain, IP, server, CF/direct."""
    h = entry.get("headers", {})
    ip = (entry.get("dns", {}).get("a_records") or ["?"])[0]
    cf = "CF" if h.get("cloudflare") else "direct"
    sw = h.get("server_software") or "?"
    print(f"    {prefix}{domain:40s} {ip:16s} {sw:12s} {cf:8s} {tag}".rstrip())


def cmd_collect(args):
    """Collect a full fingerprint for a provider and save it."""
    print(f"\n{'=' * 60}")
    print(f"  FINGERPRINTING: {args.name}")
    print(f"{'=' * 60}")

    data = {}

    # Build full DNS list: primary URL domain + any additional --dns entries
    primary_domain = urlparse(args.url).hostname
    all_domains = [primary_domain] + [d for d in _parse_domains(args.dns) if d != primary_domain]

    total_dns = len(all_domains)
    total_steps = 3 + total_dns  # xtream + stream_test + match + (per-DNS: headers/dns/whois/osint)

    # 1. Xtream API collection
    print(f"\n[1/{total_steps}] Xtream API Collection")
    try:
        data["xtream"] = xtream.collect(args.url, args.user, args.password)
    except ConnectionError as e:
        print(f"  [!] {e}")
        print(f"  [!] Cannot proceed without API access.")
        return

    # 2. Investigate each DNS entry (WHOIS only for primary to avoid rate limits)
    data["dns_entries"] = {}
    for i, domain in enumerate(all_domains):
        is_primary = domain == primary_domain
        tag = "(primary)" if is_primary else "(alternate)"
        print(f"\n[{i + 2}/{total_steps}] Investigating {domain} {tag}")
        port = urlparse(args.url).port if is_primary else None
        data["dns_entries"][domain] = _investigate(domain, port, whois=is_primary)

    # Keep backward compatibility: copy primary domain's data to top-level keys
    primary_entry = data["dns_entries"].get(primary_domain, {})
    data["headers"] = primary_entry.get("headers", {})
    data["dns"] = primary_entry.get("dns", {})
    data["whois"] = primary_entry.get("whois", {})
    data["osint"] = primary_entry.get("osint", {})

    # 3. Stream sample (if we have streams)
    streams_list = data["xtream"].get("streams", [])
    if streams_list and args.stream_test:
        print(f"\n[{total_steps - 1}/{total_steps}] Stream Analysis")
        stream_id = streams_list[0].get("stream_id")
        stream_url = f"{args.url.rstrip('/')}/live/{args.user}/{args.password}/{stream_id}.ts"
        data["stream_sample"] = stream.collect(stream_url)

    # Merge user-supplied EPG URLs
    if args.epg:
        xt = data["xtream"]
        xt["epg_urls"] = sorted(set(xt.get("epg_urls", [])) | set(_split_csv(args.epg)))
        print(f"\n  [+] EPG URLs: {', '.join(xt['epg_urls'])}")

    # Save
    data["name"] = args.name
    data["all_domains"] = all_domains
    signature.save_fingerprint(args.name, data)

    # Summary
    xt = data["xtream"]
    print(f"\n{'=' * 60}")
    print(f"  FINGERPRINT SUMMARY: {args.name}")
    print(f"{'=' * 60}")
    print(f"  API type:        {xt.get('api_type', 'unknown')}")
    print(f"  Categories:      {len(xt.get('categories', []))}")
    print(f"  Live streams:    {len(xt.get('streams', []))}")
    print(f"  VOD items:       {len(xt.get('vod_streams', []))}")
    print(f"  Series cats:     {len(xt.get('series_categories', []))}")
    print(f"  Logo domains:    {len(xt.get('logo_domains', []))}")
    print(f"  EPG URLs:        {len(xt.get('epg_urls', []))}")
    print(f"  DNS entries:     {total_dns} investigated")

    for domain, entry in data["dns_entries"].items():
        _print_row(domain, entry)

    print(f"{'=' * 60}\n")

    # Match against known providers
    matches = match_against_known(data)
    print_known_match_report(matches, args.name)


def cmd_compare(args):
    """Compare two saved fingerprints."""
    report = compare.compare(_load(args.a), _load(args.b))
    compare.print_report(report)


def cmd_investigate(args):
    """Run infrastructure investigation on a domain without credentials."""
    print(f"\n{'=' * 60}")
    print(f"  INVESTIGATING: {args.domain}")
    print(f"{'=' * 60}")

    _investigate(args.domain, args.port)

    print(f"\n{'=' * 60}")
    print(f"  INVESTIGATION COMPLETE: {args.domain}")
    print(f"{'=' * 60}\n")


def cmd_list(args):
    """List all saved fingerprints."""
    signature.list_fingerprints()


def cmd_enrich(args):
    """Add new DNS entries to an existing fingerprint with full OSINT investigation."""
    fp = _load(args.name)

    if not args.dns and not args.epg:
        print("\n  Error: provide --dns and/or --epg.")
        return

    # Handle EPG URLs first
    if args.epg:
        xt = fp.setdefault("xtream", {})
        existing_epgs = set(xt.get("epg_urls", []))
        added_epgs = sorted(set(_split_csv(args.epg)) - existing_epgs)
        xt["epg_urls"] = sorted(existing_epgs | set(added_epgs))
        if added_epgs:
            print(f"\n  [+] Added EPG URLs: {', '.join(added_epgs)}")
        else:
            print(f"\n  [.] EPG URLs already present, nothing new.")

    # If no DNS to process, just save the EPG additions and return
    if not args.dns:
        signature.save_fingerprint(args.name, fp)
        print(f"  [+] Saved to {args.name}")
        return

    new_domains = _parse_domains(args.dns)
    if not new_domains:
        print("\n  Error: No valid domains parsed from --dns input.")
        return

    # Check which are actually new
    existing_entries = fp.get("dns_entries", {})
    all_domains = fp.get("all_domains", list(existing_entries))

    truly_new = [d for d in new_domains if d not in existing_entries]
    already_known = [d for d in new_domains if d in existing_entries]

    if already_known:
        print(f"\n  Already in fingerprint: {', '.join(already_known)}")

    if not truly_new:
        # Still save in case EPG was added above
        signature.save_fingerprint(args.name, fp)
        print(f"  No new domains to investigate.")
        return

    print(f"\n{'=' * 60}")
    print(f"  ENRICHING: {args.name}")
    print(f"  Adding {len(truly_new)} new DNS entries")
    print(f"{'=' * 60}")

    for i, domain in enumerate(truly_new):
        print(f"\n[{i + 1}/{len(truly_new)}] Investigating {domain}")
        existing_entries[domain] = _investigate(domain, args.port, whois=args.whois)
        all_domains.append(domain)

    # Write back
    fp["dns_entries"] = existing_entries
    fp["all_domains"] = all_domains
    signature.save_fingerprint(args.name, fp)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"  ENRICHMENT COMPLETE: {args.name}")
    print(f"  Total DNS entries: {len(all_domains)}")
    print(f"{'=' * 60}")

    for domain, entry in existing_entries.items():
        _print_row(domain, entry, tag="NEW" if domain in truly_new else "")

    print()


def cmd_delete(args):
    """Delete a saved fingerprint."""
    try:
        signature.delete_fingerprint(args.name)
    except KeyError as e:
        print(f"\n  Error: {e}")


def cmd_merge(args):
    """Merge a scan into an existing fingerprint as an alias."""
    source = _load(args.source)
    target = _load(args.into)

    print(f"\n{'=' * 60}")
    print(f"  MERGING: {args.source} → {args.into}")
    print(f"{'=' * 60}")

    # Track aliases, carrying over any aliases the source had too
    aliases = target.get("aliases", [])
    for a in [args.source] + source.get("aliases", []):
        if a not in aliases and a != args.into:
            aliases.append(a)
    target["aliases"] = aliases

    # Merge DNS entries
    target_dns_entries = target.get("dns_entries", {})
    target_all_domains = target.get("all_domains", list(target_dns_entries))
    new_domains = [d for d in source.get("dns_entries", {}) if d not in target_dns_entries]
    for d in new_domains:
        target_dns_entries[d] = source["dns_entries"][d]
        target_all_domains.append(d)
    target["dns_entries"] = target_dns_entries
    target["all_domains"] = target_all_domains

    # Merge EPG URLs and logo domains
    target_xt = target.setdefault("xtream", {})
    source_xt = source.get("xtream", {})
    new_epgs = sorted(set(source_xt.get("epg_urls", [])) - set(target_xt.get("epg_urls", [])))
    new_logos = sorted(set(source_xt.get("logo_domains", [])) - set(target_xt.get("logo_domains", [])))
    target_xt["epg_urls"] = sorted(set(target_xt.get("epg_urls", [])) | set(new_epgs))
    target_xt["logo_domains"] = sorted(set(target_xt.get("logo_domains", [])) | set(new_logos))

    # Merge OSINT data (keep source's if target doesn't have it)
    if source.get("osint") and not target.get("osint"):
        target["osint"] = source["osint"]

    signature.save_fingerprint(args.into, target)

    # Summary
    print(f"\n  Aliases:         {', '.join(aliases)}")
    print(f"  New DNS entries: {len(new_domains)}")
    for d in new_domains:
        _print_row(d, target_dns_entries[d], prefix="+ ")
    if new_epgs:
        print(f"  New EPG URLs:    {', '.join(new_epgs)}")
    if new_logos:
        print(f"  New logo domains:{', '.join(new_logos)}")

    if args.delete_source:
        signature.delete_fingerprint(args.source)
        print(f"\n  Deleted source fingerprint '{args.source}'")

    print(f"\n  Total DNS entries in '{args.into}': {len(target_all_domains)}")
    print(f"  Total aliases: {len(aliases)}")
    print(f"{'=' * 60}\n")


def cmd_alias(args):
    """Add or remove alias names for a saved fingerprint."""
    fp = _load(args.name)
    aliases = fp.get("aliases", [])

    if args.remove:
        removed = [a for a in args.alias if a in aliases]
        if removed:
            fp["aliases"] = [a for a in aliases if a not in removed]
            signature.save_fingerprint(args.name, fp)
            print(f"\n  Removed aliases: {', '.join(removed)}")
        else:
            print(f"\n  None of those aliases were found.")
        return

    added = [a for a in dict.fromkeys(args.alias) if a not in aliases]
    if added:
        fp["aliases"] = aliases + added
        signature.save_fingerprint(args.name, fp)
        print(f"\n  Added aliases to '{args.name}': {', '.join(added)}")
    else:
        print(f"\n  All aliases already present.")

    print(f"  All aliases: {', '.join(aliases + added)}")


def cmd_export(args):
    """Export all categories and channels from a provider to CSV."""
    import csv

    server_url = args.url.rstrip("/")
    auth_params = {"username": args.user, "password": args.password}
    req_headers = {"User-Agent": "TiviMate/4.4.0 (Linux; Android 11)"}

    print(f"\n  Connecting to {server_url}...")

    api_path = None
    for path in ["player_api.php", "api.php"]:
        auth_data = xtream._api_get(f"{server_url}/{path}", auth_params, req_headers, 15)
        if isinstance(auth_data, dict) and "user_info" in auth_data:
            api_path = path
            break

    if not api_path:
        print(f"  Error: Could not authenticate with {server_url}")
        return

    print(f"  Authenticated via {api_path}")
    api_base = f"{server_url}/{api_path}"

    def fetch(action, timeout):
        data = xtream._api_get(api_base, {**auth_params, "action": action}, req_headers, timeout)
        return data if isinstance(data, list) else []

    print(f"  Fetching categories...")
    categories = fetch("get_live_categories", 30)
    cat_lookup = {str(c.get("category_id", "")): c.get("category_name", "Uncategorized") for c in categories}
    print(f"  Found {len(categories)} categories")

    print(f"  Fetching channels (this may take a moment)...")
    streams = fetch("get_live_streams", 60)
    print(f"  Found {len(streams)} channels")

    if not streams:
        print(f"  Nothing to export.")
        return

    output = args.output or os.path.join(config.DATA_DIR, f"{args.name}_channels.csv")

    # Sort by category name, then channel name
    streams.sort(key=lambda s: (
        cat_lookup.get(str(s.get("category_id") or ""), "ZZZ_Uncategorized"),
        s.get("name") or "",
    ))

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "category_id",
            "category_name",
            "stream_id",
            "channel_name",
            "epg_channel_id",
            "stream_icon",
        ])

        for s in streams:
            cat_id = str(s.get("category_id", ""))
            writer.writerow([
                cat_id,
                cat_lookup.get(cat_id, "Uncategorized"),
                s.get("stream_id", ""),
                s.get("name", ""),
                s.get("epg_channel_id", ""),
                s.get("stream_icon", ""),
            ])

    print(f"\n  Exported {len(streams)} channels across {len(categories)} categories to {output}")
    print(f"  File size: {os.path.getsize(output) / 1024:.0f} KB")

    # Print category summary
    cat_counts = {}
    for s in streams:
        cat_name = cat_lookup.get(str(s.get("category_id", "")), "Uncategorized")
        cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1

    print(f"\n  Top 20 categories by channel count:\n")
    for name, count in sorted(cat_counts.items(), key=lambda x: -x[1])[:20]:
        print(f"    {count:6d}  {name}")


def cmd_match(args):
    """Match a saved fingerprint against known providers."""
    matches = match_against_known(_load(args.name))
    print_known_match_report(matches, args.name)


def cmd_promote(args):
    """Promote a saved fingerprint to the user's known providers database."""
    fp = _load(args.name)

    provider_id = args.id
    display_name = args.display

    if provider_id in KNOWN_PROVIDERS:
        print(f"\n  [.] Provider ID '{provider_id}' already exists, replacing it.")

    xtream_data = fp.get("xtream", {})
    dns_data = fp.get("dns", {})
    headers_data = fp.get("headers", {})

    # Extract key attributes
    categories = xtream_data.get("categories", [])
    cat_ids = [str(c.get("category_id", "")) for c in categories[:30]]
    cat_names = [c.get("category_name", "") for c in categories[:9]]
    stream_ids = xtream_data.get("stream_id_set", [])[:30]
    patterns = xtream_data.get("naming_patterns", {})
    stream_count = len(xtream_data.get("streams", []))
    cat_count = len(categories)
    domain = dns_data.get("domain", "")

    # Build the DNS list from scanned domains + enriched domains + any --dns arg
    known_dns = list(fp.get("all_domains", []))
    if domain and domain not in known_dns:
        known_dns.insert(0, domain)
    known_dns += [d for d in _parse_domains(args.dns) if d not in known_dns]

    # Build stream/category count ranges (+-5%)
    margin = max(int(stream_count * 0.05), 500)
    stream_range = [stream_count - margin, stream_count + margin]
    cat_margin = max(int(cat_count * 0.05), 20)
    cat_range = [cat_count - cat_margin, cat_count + cat_margin]

    save_user_provider(provider_id, {
        "display_name": display_name,
        "known_dns": known_dns,
        "sample_category_ids": cat_ids,
        "sample_stream_ids": stream_ids,
        "category_names_ordered": cat_names,
        "naming_pattern": {
            "uses_pipes": patterns.get("uses_pipes", False),
            "uses_brackets": patterns.get("uses_brackets", False),
            "uses_unicode_stars": patterns.get("uses_unicode_stars", False),
            "separator_char": patterns.get("separator_char", ""),
            "country_code_style": patterns.get("country_code_style", ""),
            "quirks": [],
        },
        "logo_domains": xtream_data.get("logo_domains", [])[:10],
        "stream_count_range": stream_range,
        "category_count_range": cat_range,
        "vod_category_count": len(xtream_data.get("vod_categories", [])) or None,
        "series_category_count": len(xtream_data.get("series_categories", [])) or None,
        "server_software": headers_data.get("server_software", ""),
        "api_type": xtream_data.get("api_type", "player_api.php"),
        "timezone": xtream_data.get("server_info", {}).get("timezone", ""),
        "notes": [
            f"Auto-promoted from scan of {args.name}",
            f"Cloudflare: {headers_data.get('cloudflare', False)}",
            f"Scanned domain: {domain}",
        ],
    })

    print(f"\n  [+] Promoted '{display_name}' as '{provider_id}' in {config.USER_PROVIDERS}")
    print(f"  [+] {len(cat_ids)} category IDs, {len(stream_ids)} stream IDs, {len(known_dns)} DNS entries")
    print(f"  [+] Stream range: {stream_range}, Category range: {cat_range}")


def cmd_web(args):
    """Serve the browser UI on localhost."""
    from . import web
    web.serve(args.port, open_browser=not args.no_browser)


def build_parser():
    parser = argparse.ArgumentParser(
        prog="iptv-fingerprint",
        description="IPTV Provider Fingerprint Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # collect
    p_collect = sub.add_parser("collect", help="Fingerprint a provider")
    p_collect.add_argument("--name", required=True, help="Name to save this fingerprint as")
    p_collect.add_argument("--url", required=True, help="Xtream server URL (e.g. http://server.com:8080)")
    p_collect.add_argument("--user", required=True, help="Xtream username")
    p_collect.add_argument("--password", "--pass", required=True, help="Xtream password", dest="password")
    p_collect.add_argument("--stream-test", action="store_true", help="Also analyze a sample .ts stream")
    p_collect.add_argument("--dns", help="Comma-separated additional DNS entries to investigate (can be domains or full URLs)")
    p_collect.add_argument("--epg", help="Comma-separated EPG URLs to associate with this provider")
    p_collect.set_defaults(func=cmd_collect)

    # compare
    p_compare = sub.add_parser("compare", help="Compare two saved fingerprints")
    p_compare.add_argument("--a", required=True, help="First provider name")
    p_compare.add_argument("--b", required=True, help="Second provider name")
    p_compare.set_defaults(func=cmd_compare)

    # investigate
    p_investigate = sub.add_parser("investigate", help="Investigate a domain without credentials")
    p_investigate.add_argument("--domain", required=True, help="Domain to investigate")
    p_investigate.add_argument("--port", type=int, help="Port to check (default: 80)")
    p_investigate.set_defaults(func=cmd_investigate)

    # list
    p_list = sub.add_parser("list", help="List saved fingerprints")
    p_list.set_defaults(func=cmd_list)

    # enrich
    p_enrich = sub.add_parser("enrich", help="Add new DNS entries and/or EPG URLs to an existing fingerprint")
    p_enrich.add_argument("--name", required=True, help="Name of existing fingerprint to enrich")
    p_enrich.add_argument("--dns", help="Comma-separated new DNS entries (domains or full URLs)")
    p_enrich.add_argument("--epg", help="Comma-separated EPG URLs to add")
    p_enrich.add_argument("--port", type=int, help="Port to check for HTTP headers (default: 80)")
    p_enrich.add_argument("--whois", action="store_true", help="Also run WHOIS on each new domain")
    p_enrich.set_defaults(func=cmd_enrich)

    # delete
    p_delete = sub.add_parser("delete", help="Delete a saved fingerprint")
    p_delete.add_argument("--name", required=True, help="Name of fingerprint to delete")
    p_delete.set_defaults(func=cmd_delete)

    # match
    p_match = sub.add_parser("match", help="Match a saved fingerprint against known providers")
    p_match.add_argument("--name", required=True, help="Name of saved fingerprint to match")
    p_match.set_defaults(func=cmd_match)

    # promote
    p_promote = sub.add_parser("promote", help="Promote a saved fingerprint to known providers database")
    p_promote.add_argument("--name", required=True, help="Name of saved fingerprint to promote")
    p_promote.add_argument("--id", required=True, help="Short ID for the known provider (e.g. 'trex')")
    p_promote.add_argument("--display", required=True, help="Display name (e.g. 'T-Rex IPTV')")
    p_promote.add_argument("--dns", help="Comma-separated list of additional known DNS entries")
    p_promote.set_defaults(func=cmd_promote)

    # export
    p_export = sub.add_parser("export", help="Export all categories and channels to CSV")
    p_export.add_argument("--name", required=True, help="Label for the output file")
    p_export.add_argument("--url", required=True, help="Xtream server URL")
    p_export.add_argument("--user", required=True, help="Xtream username")
    p_export.add_argument("--password", "--pass", required=True, help="Xtream password", dest="password")
    p_export.add_argument("--output", "-o", help="Output filename (default: <name>_channels.csv)")
    p_export.set_defaults(func=cmd_export)

    # merge
    p_merge = sub.add_parser("merge", help="Merge a scan into an existing fingerprint as an alias")
    p_merge.add_argument("--source", required=True, help="Name of the scan to merge FROM")
    p_merge.add_argument("--into", required=True, help="Name of the existing fingerprint to merge INTO")
    p_merge.add_argument("--delete-source", action="store_true", help="Delete the source fingerprint after merging")
    p_merge.set_defaults(func=cmd_merge)

    # alias
    p_alias = sub.add_parser("alias", help="Add or remove alias names for a fingerprint")
    p_alias.add_argument("--name", required=True, help="Name of the fingerprint")
    p_alias.add_argument("alias", nargs="+", help="Alias name(s) to add or remove")
    p_alias.add_argument("--remove", action="store_true", help="Remove the specified aliases instead of adding")
    p_alias.set_defaults(func=cmd_alias)

    # web
    p_web = sub.add_parser("web", help="Open the browser UI")
    p_web.add_argument("--port", type=int, default=8765, help="Local port (default: 8765)")
    p_web.add_argument("--no-browser", action="store_true", help="Don't open a browser tab")
    p_web.set_defaults(func=cmd_web)

    return parser


def main(argv=None):
    # No arguments (e.g. double-clicked) -> open the browser UI
    args = build_parser().parse_args(argv if argv is not None else sys.argv[1:] or ["web"])
    args.func(args)


if __name__ == "__main__":
    main()
