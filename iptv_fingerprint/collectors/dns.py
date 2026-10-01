import socket
import requests


def collect(domain, timeout=10):
    """
    Collect DNS and network intelligence for a domain.
    Uses only free, keyless sources.
    """
    result = {
        "domain": domain,
        "a_records": [],
        "mx_records": [],
        "ns_records": [],
        "txt_records": [],
        "ip_info": {},
        "crt_sh": [],
        "reverse_ip_domains": [],
    }

    print(f"  [.] Resolving DNS for {domain}...")

    # A records
    result["a_records"] = _dig(domain, "A")
    print(f"  [+] A records: {', '.join(result['a_records']) or 'none'}")

    # MX records (can leak origin IP if not behind CF)
    result["mx_records"] = _dig(domain, "MX")
    if result["mx_records"]:
        print(f"  [+] MX records: {', '.join(result['mx_records'])}")

    # NS records
    result["ns_records"] = _dig(domain, "NS")

    # TXT records
    result["txt_records"] = _dig(domain, "TXT")

    # IP info for each A record
    for ip in result["a_records"][:3]:
        info = _ip_info(ip, timeout)
        if info:
            result["ip_info"][ip] = info
            org = info.get("org", "unknown")
            loc = f"{info.get('city', '')}, {info.get('country', '')}"
            print(f"  [+] {ip}: {org} ({loc})")

    # Certificate Transparency via crt.sh
    print(f"  [.] Querying crt.sh for certificate history...")
    result["crt_sh"] = _crt_sh(domain, timeout)
    if result["crt_sh"]:
        unique_names = set()
        for cert in result["crt_sh"]:
            for name in cert.get("names", []):
                unique_names.add(name)
        print(f"  [+] crt.sh: {len(result['crt_sh'])} certs, {len(unique_names)} unique hostnames")
    else:
        print(f"  [-] crt.sh: no results")

    # Reverse IP lookup for primary IP
    if result["a_records"]:
        primary_ip = result["a_records"][0]
        print(f"  [.] Reverse IP lookup for {primary_ip}...")
        result["reverse_ip_domains"] = _reverse_ip(primary_ip, timeout)
        if result["reverse_ip_domains"]:
            print(f"  [+] Found {len(result['reverse_ip_domains'])} other domains on same IP")
        else:
            print(f"  [-] No reverse IP results")

    return result


_DNS_TYPES = {"A": 1, "NS": 2, "MX": 15, "TXT": 16}


def _dig(domain, record_type):
    """Resolve via Google DNS-over-HTTPS, so no `dig` binary is needed (Windows/Mac)."""
    try:
        resp = requests.get(
            "https://dns.google/resolve",
            params={"name": domain, "type": record_type},
            timeout=10,
        )
        answers = resp.json().get("Answer", [])
        return [a["data"].strip().rstrip(".") for a in answers if a.get("type") == _DNS_TYPES[record_type]]
    except (requests.RequestException, ValueError):
        # Fallback to the system resolver for A records
        if record_type == "A":
            try:
                return [socket.gethostbyname(domain)]
            except socket.gaierror:
                return []
        return []


def _ip_info(ip, timeout):
    """Get IP geolocation and ASN info from ipinfo.io (free, no key)."""
    try:
        resp = requests.get(f"https://ipinfo.io/{ip}/json", timeout=timeout)
        if resp.status_code == 200:
            return resp.json()
    except requests.RequestException:
        pass
    return {}


def _crt_sh(domain, timeout):
    """Query crt.sh Certificate Transparency logs. Free, no key."""
    try:
        resp = requests.get(
            f"https://crt.sh/?q=%.{domain}&output=json",
            timeout=max(timeout, 30),
            headers={"User-Agent": "iptv-fingerprint/1.0"},
        )
        if resp.status_code == 200:
            certs = resp.json()
            # Deduplicate and extract useful fields
            seen = set()
            results = []
            for cert in certs:
                cert_id = cert.get("id")
                if cert_id in seen:
                    continue
                seen.add(cert_id)
                name_value = cert.get("name_value", "")
                names = [n.strip().lower() for n in name_value.split("\n") if n.strip() and "*" not in n]
                results.append({
                    "id": cert_id,
                    "issuer": cert.get("issuer_name", ""),
                    "not_before": cert.get("not_before", ""),
                    "not_after": cert.get("not_after", ""),
                    "common_name": cert.get("common_name", ""),
                    "names": names,
                })
            return results
    except (requests.RequestException, ValueError):
        pass
    return []


def _reverse_ip(ip, timeout):
    """
    Reverse IP lookup using free sources.
    Tries ViewDNS.info scraping and falls back to ipinfo.io.
    """
    domains = []

    # Try ipinfo.io reverse (limited but free)
    try:
        resp = requests.get(
            f"https://ipinfo.io/{ip}/json",
            timeout=timeout,
        )
        if resp.status_code == 200:
            data = resp.json()
            hostname = data.get("hostname", "")
            if hostname and hostname != ip:
                domains.append(hostname)
    except requests.RequestException:
        pass

    # Try HackerTarget reverse IP (free, no key, 100/day limit)
    try:
        resp = requests.get(
            f"https://api.hackertarget.com/reverseiplookup/?q={ip}",
            timeout=timeout,
        )
        if resp.status_code == 200 and "error" not in resp.text.lower():
            for line in resp.text.strip().split("\n"):
                d = line.strip()
                if d and d != ip and "API count" not in d:
                    domains.append(d)
    except requests.RequestException:
        pass

    return sorted(set(domains))
