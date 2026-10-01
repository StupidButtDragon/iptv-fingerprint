import requests
import re
from urllib.parse import urlparse


def collect(server_url, username, password, timeout=15):
    """
    Connect to an Xtream-compatible API and pull all fingerprinting data.
    Returns a dict with categories, streams, server info, and metadata.
    """
    server_url = server_url.rstrip("/")
    ua = "TiviMate/4.4.0 (Linux; Android 11)"
    headers = {"User-Agent": ua}
    result = {
        "server_url": server_url,
        "api_type": None,
        "server_info": {},
        "user_info": {},
        "categories": [],
        "streams": [],
        "vod_categories": [],
        "vod_streams": [],
        "series_categories": [],
        "epg_urls": [],
        "logo_domains": set(),
        "stream_id_set": set(),
        "category_id_set": set(),
        "naming_patterns": {},
    }

    # Try standard Xtream player_api.php first, fall back to api.php (MpegTV)
    auth_data = None
    for api_path in ["player_api.php", "api.php"]:
        try:
            url = f"{server_url}/{api_path}"
            params = {"username": username, "password": password}
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            if resp.status_code == 200:
                data = resp.json()
                if data and isinstance(data, dict) and "user_info" in data:
                    auth_data = data
                    result["api_type"] = api_path
                    break
                elif data and isinstance(data, dict) and data.get("result") is False:
                    print(f"  [!] {api_path}: {data.get('0', 'rejected')}")
                    continue
        except (requests.RequestException, ValueError):
            continue

    if not auth_data:
        raise ConnectionError(f"Could not authenticate with {server_url}")

    # Server and user info
    result["server_info"] = auth_data.get("server_info", {})
    result["user_info"] = auth_data.get("user_info", {})

    print(f"  [+] Authenticated via {result['api_type']}")
    print(f"  [+] Server: {result['server_info'].get('url', 'unknown')}")
    print(f"  [+] Timezone: {result['server_info'].get('timezone', 'unknown')}")

    api_base = f"{server_url}/{result['api_type']}"
    auth_params = {"username": username, "password": password}

    # Live categories
    print("  [.] Fetching live categories...")
    cats = _api_get(api_base, {**auth_params, "action": "get_live_categories"}, headers, timeout)
    if isinstance(cats, list):
        result["categories"] = cats
        for c in cats:
            result["category_id_set"].add(str(c.get("category_id", "")))

    # Live streams
    print("  [.] Fetching live streams...")
    streams = _api_get(api_base, {**auth_params, "action": "get_live_streams"}, headers, timeout)
    if isinstance(streams, list):
        result["streams"] = streams
        for s in streams:
            result["stream_id_set"].add(str(s.get("stream_id", "")))
            # Extract logo domains
            logo = s.get("stream_icon", "")
            if logo:
                try:
                    domain = urlparse(logo).hostname
                    if domain:
                        result["logo_domains"].add(domain)
                except Exception:
                    pass

    # VOD categories
    print("  [.] Fetching VOD categories...")
    vod_cats = _api_get(api_base, {**auth_params, "action": "get_vod_categories"}, headers, timeout)
    if isinstance(vod_cats, list):
        result["vod_categories"] = vod_cats

    # VOD streams (just first page / limited for fingerprinting)
    print("  [.] Fetching VOD streams...")
    vod = _api_get(api_base, {**auth_params, "action": "get_vod_streams"}, headers, timeout)
    if isinstance(vod, list):
        result["vod_streams"] = vod[:500]  # cap for fingerprinting

    # Series categories
    print("  [.] Fetching series categories...")
    series_cats = _api_get(api_base, {**auth_params, "action": "get_series_categories"}, headers, timeout)
    if isinstance(series_cats, list):
        result["series_categories"] = series_cats

    # Try to get M3U playlist for EPG URL extraction
    print("  [.] Checking M3U for EPG URLs...")
    epg_urls = _extract_epg_urls(server_url, username, password, headers, timeout)
    result["epg_urls"] = epg_urls

    # Analyze naming patterns
    result["naming_patterns"] = _analyze_naming(result["categories"])

    # Convert sets to lists for JSON serialization
    result["stream_id_set"] = sorted(result["stream_id_set"])
    result["category_id_set"] = sorted(result["category_id_set"])
    result["logo_domains"] = sorted(result["logo_domains"])

    print(f"  [+] Collected: {len(result['categories'])} categories, "
          f"{len(result['streams'])} streams, "
          f"{len(result['vod_categories'])} VOD categories, "
          f"{len(result['vod_streams'])} VOD items, "
          f"{len(result['series_categories'])} series categories")
    print(f"  [+] Logo domains: {', '.join(result['logo_domains'][:5]) or 'none found'}")
    print(f"  [+] EPG URLs: {', '.join(result['epg_urls'][:3]) or 'none found'}")

    return result


def _api_get(base_url, params, headers, timeout):
    try:
        resp = requests.get(base_url, params=params, headers=headers, timeout=timeout)
        if resp.status_code == 200 and resp.text.strip():
            return resp.json()
    except (requests.RequestException, ValueError):
        pass
    return []


def _extract_epg_urls(server_url, username, password, headers, timeout):
    """Try to fetch the M3U playlist header to extract EPG URL."""
    epg_urls = []
    for endpoint in ["get.php", "get.php"]:
        try:
            params = {
                "username": username,
                "password": password,
                "type": "m3u_plus",
                "output": "ts",
            }
            resp = requests.get(
                f"{server_url}/{endpoint}",
                params=params,
                headers=headers,
                timeout=timeout,
                stream=True,
            )
            if resp.status_code == 200:
                # Read just the first 2KB to get the header
                chunk = resp.raw.read(2048).decode("utf-8", errors="ignore")
                resp.close()
                # Extract url-tvg from #EXTM3U header
                match = re.search(r'url-tvg="([^"]+)"', chunk)
                if match:
                    epg_urls.append(match.group(1))
                break
        except Exception:
            continue
    return epg_urls


def _analyze_naming(categories):
    """Analyze category naming conventions for fingerprinting."""
    patterns = {
        "uses_pipes": False,       # |US| style
        "uses_brackets": False,    # [US] style
        "uses_emoji": False,
        "uses_unicode_stars": False,
        "separator_char": None,
        "country_code_style": None,
        "sample_names": [],
    }

    if not categories:
        return patterns

    pipe_count = 0
    bracket_count = 0
    emoji_count = 0
    star_count = 0

    for cat in categories[:50]:
        name = cat.get("category_name", "")
        if "|" in name:
            pipe_count += 1
        if "[" in name:
            bracket_count += 1
        if "✪" in name or "★" in name or "☆" in name or "✫" in name:
            star_count += 1
        # Basic emoji detection (outside ASCII + common Unicode blocks)
        if any(ord(c) > 0x2600 for c in name):
            emoji_count += 1

    total = len(categories[:50])
    patterns["uses_pipes"] = pipe_count > total * 0.3
    patterns["uses_brackets"] = bracket_count > total * 0.3
    patterns["uses_unicode_stars"] = star_count > total * 0.3
    patterns["uses_emoji"] = emoji_count > total * 0.3
    patterns["sample_names"] = [c.get("category_name", "") for c in categories[:20]]

    # Detect separator character
    if patterns["uses_pipes"]:
        patterns["separator_char"] = "|"
        patterns["country_code_style"] = "pipe"
    elif patterns["uses_brackets"]:
        patterns["separator_char"] = "[]"
        patterns["country_code_style"] = "bracket"

    return patterns
