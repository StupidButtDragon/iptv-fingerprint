import re
import subprocess

import requests

PRIVACY_KEYWORDS = ["privacy", "redacted", "whoisguard", "domains by proxy", "contact privacy", "withheld"]


def collect(domain, timeout=10):
    """
    Query registration data for a domain. Uses RDAP over HTTPS (works on any OS),
    falling back to the system `whois` command if RDAP has no answer.
    No API key needed.
    """
    print(f"  [.] WHOIS lookup for {domain}...")
    result = {
        "domain": domain,
        "registrar": None,
        "creation_date": None,
        "expiry_date": None,
        "updated_date": None,
        "nameservers": [],
        "registrant_country": None,
        "privacy_protected": False,
    }

    raw = _rdap(domain, result, timeout) or _whois(domain, result, timeout)
    if raw is None:
        print(f"  [-] No registration data found")
        return result

    result["privacy_protected"] = any(kw in raw.lower() for kw in PRIVACY_KEYWORDS)

    if result["registrar"]:
        print(f"  [+] Registrar: {result['registrar']}")
    if result["creation_date"]:
        print(f"  [+] Created: {result['creation_date']}")
    if result["nameservers"]:
        print(f"  [+] Nameservers: {', '.join(result['nameservers'][:4])}")
    if result["privacy_protected"]:
        print(f"  [+] Privacy protection: enabled")

    return result


def _rdap(domain, result, timeout):
    """Fill result from rdap.org (redirects to the registry's RDAP server). Returns raw text or None."""
    try:
        resp = requests.get(f"https://rdap.org/domain/{domain}", timeout=timeout)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except (requests.RequestException, ValueError):
        return None

    events = {e.get("eventAction"): e.get("eventDate") for e in data.get("events", [])}
    result["creation_date"] = events.get("registration")
    result["expiry_date"] = events.get("expiration")
    result["updated_date"] = events.get("last changed")
    result["nameservers"] = [ns.get("ldhName", "").lower().rstrip(".") for ns in data.get("nameservers", [])]

    for entity in data.get("entities", []):
        vcard = entity.get("vcardArray", [None, []])[1]
        fields = {f[0]: f[3] for f in vcard if len(f) > 3}
        if "registrar" in entity.get("roles", []):
            result["registrar"] = fields.get("fn")
        if "registrant" in entity.get("roles", []):
            adr = fields.get("adr")
            if isinstance(adr, list) and adr and adr[-1]:
                result["registrant_country"] = adr[-1]

    return resp.text


def _whois(domain, result, timeout):
    """Fill result from the system whois command. Returns raw text or None."""
    try:
        raw = subprocess.run(["whois", domain], capture_output=True, text=True, timeout=timeout).stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None

    result["registrar"] = _extract(raw, r"Registrar:\s*(.+)")
    result["creation_date"] = _extract(raw, r"Creation Date:\s*(.+)") or _extract(raw, r"Created:\s*(.+)")
    result["expiry_date"] = _extract(raw, r"Registry Expiry Date:\s*(.+)") or _extract(raw, r"Expiration Date:\s*(.+)")
    result["updated_date"] = _extract(raw, r"Updated Date:\s*(.+)")
    result["registrant_country"] = _extract(raw, r"Registrant Country:\s*(.+)")
    result["nameservers"] = [ns.lower().rstrip(".") for ns in re.findall(r"Name Server:\s*(\S+)", raw, re.IGNORECASE)]
    return raw


def _extract(text, pattern):
    """Extract first regex match from text."""
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else None
