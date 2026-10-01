import requests
import ssl
import socket
import json
from urllib.parse import urlparse


def collect(server_url, timeout=10):
    """
    Collect HTTP headers and SSL certificate data from a server.
    Identifies server software, CDN usage, and certificate details.
    """
    server_url = server_url.rstrip("/")
    parsed = urlparse(server_url)
    hostname = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    result = {
        "url": server_url,
        "hostname": hostname,
        "port": port,
        "http_headers": {},
        "server_software": None,
        "cdn_detected": None,
        "cloudflare": False,
        "cf_ray": None,
        "ssl_cert": None,
        "ssl_sans": [],
        "ssl_issuer": None,
        "ssl_subject": None,
        "panel_fingerprint": None,
    }

    # HTTP headers
    print(f"  [.] Fetching HTTP headers from {server_url}...")
    try:
        resp = requests.head(
            server_url,
            headers={"User-Agent": "TiviMate/4.4.0 (Linux; Android 11)"},
            timeout=timeout,
            allow_redirects=True,
            verify=False,
        )

        hdrs = dict(resp.headers)
        result["http_headers"] = hdrs
        result["server_software"] = hdrs.get("Server", hdrs.get("server"))

        # Cloudflare detection
        cf_ray = hdrs.get("CF-RAY", hdrs.get("cf-ray"))
        if cf_ray:
            result["cloudflare"] = True
            result["cf_ray"] = cf_ray
            # Extract datacenter code (last 3 chars)
            dc = cf_ray.split("-")[-1] if "-" in cf_ray else ""
            print(f"  [+] Cloudflare detected (edge: {dc})")

        # CDN detection from headers
        cdn = _detect_cdn(hdrs)
        if cdn:
            result["cdn_detected"] = cdn
            print(f"  [+] CDN: {cdn}")

        if result["server_software"]:
            print(f"  [+] Server: {result['server_software']}")

    except requests.RequestException as e:
        print(f"  [-] HTTP request failed: {e}")

    # Also try common panel ports for additional headers
    for panel_port in [8080, 8443, 25461]:
        if panel_port == port:
            continue
        panel_url = f"http://{hostname}:{panel_port}"
        try:
            resp = requests.head(
                panel_url,
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=5,
                allow_redirects=True,
                verify=False,
            )
            if resp.status_code < 500:
                panel_server = resp.headers.get("Server", "")
                ct = resp.headers.get("Content-Type", "")
                result["panel_fingerprint"] = {
                    "port": panel_port,
                    "server": panel_server,
                    "status": resp.status_code,
                    "content_type": ct,
                }
                print(f"  [+] Panel detected on port {panel_port}: {panel_server or 'unknown'} (HTTP {resp.status_code})")
                break
        except requests.RequestException:
            continue

    # SSL certificate analysis
    for ssl_port in [443, 8443]:
        cert_data = _get_ssl_cert(hostname, ssl_port)
        if cert_data:
            result["ssl_cert"] = cert_data
            result["ssl_sans"] = cert_data.get("sans", [])
            result["ssl_issuer"] = cert_data.get("issuer", "")
            result["ssl_subject"] = cert_data.get("subject", "")
            if result["ssl_sans"]:
                print(f"  [+] SSL SANs ({ssl_port}): {', '.join(result['ssl_sans'][:5])}")
            if result["ssl_issuer"]:
                print(f"  [+] SSL Issuer: {result['ssl_issuer']}")
            break

    return result


def _detect_cdn(headers):
    """Detect CDN provider from HTTP headers."""
    checks = [
        ("CF-RAY", "Cloudflare"),
        ("cf-ray", "Cloudflare"),
        ("X-Amz-Cf-Id", "AWS CloudFront"),
        ("X-Amz-Cf-Pop", "AWS CloudFront"),
        ("X-Cache", None),  # Generic CDN
        ("X-Served-By", None),
        ("X-CDN", None),
    ]

    for header, cdn_name in checks:
        val = headers.get(header, "")
        if val:
            if cdn_name:
                return cdn_name
            # Try to identify from value
            val_lower = val.lower()
            if "cloudfront" in val_lower:
                return "AWS CloudFront"
            if "fastly" in val_lower:
                return "Fastly"
            if "varnish" in val_lower:
                return "Varnish"
            if "akamai" in val_lower:
                return "Akamai"
            if "bunny" in val_lower or "b-cdn" in val_lower:
                return "BunnyCDN"
            if "stackpath" in val_lower:
                return "StackPath"

    # Check Server header for known CDN servers
    server = headers.get("Server", headers.get("server", "")).lower()
    if "cloudflare" in server:
        return "Cloudflare"
    if "litespeed" in server:
        return "LiteSpeed"

    return None


def _get_ssl_cert(hostname, port):
    """Extract SSL certificate details."""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        with socket.create_connection((hostname, port), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert(binary_form=False)
                if not cert:
                    # Try binary form and parse
                    der = ssock.getpeercert(binary_form=True)
                    if der:
                        return {"raw_der_length": len(der)}
                    return None

                # Extract SANs
                sans = []
                for entry_type, entry_value in cert.get("subjectAltName", []):
                    if entry_type == "DNS":
                        sans.append(entry_value)

                # Extract subject
                subject_parts = []
                for rdn in cert.get("subject", []):
                    for attr_type, attr_value in rdn:
                        subject_parts.append(f"{attr_type}={attr_value}")

                # Extract issuer
                issuer_parts = []
                for rdn in cert.get("issuer", []):
                    for attr_type, attr_value in rdn:
                        issuer_parts.append(f"{attr_type}={attr_value}")

                return {
                    "subject": ", ".join(subject_parts),
                    "issuer": ", ".join(issuer_parts),
                    "sans": sans,
                    "not_before": cert.get("notBefore", ""),
                    "not_after": cert.get("notAfter", ""),
                    "serial": cert.get("serialNumber", ""),
                    "version": cert.get("version", ""),
                }
    except (socket.error, ssl.SSLError, OSError):
        return None
