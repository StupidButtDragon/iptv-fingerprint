import requests


def collect(ip, domain, censys_key="", urlscan_key="", timeout=15):
    """
    Query OSINT APIs for additional infrastructure data.
    Shodan InternetDB is free, no key needed.
    Censys and urlscan.io are optional, keyed.
    """
    result = {
        "shodan_internetdb": None,
        "censys": None,
        "urlscan": None,
    }

    # Shodan InternetDB - always runs, free, no key
    result["shodan_internetdb"] = _shodan_internetdb(ip, timeout)

    if censys_key:
        result["censys"] = _censys_lookup(ip, censys_key, timeout)
    else:
        print("  [.] Censys: skipped (no API key)")

    if urlscan_key and domain:
        result["urlscan"] = _urlscan_search(domain, urlscan_key, timeout)
    else:
        print("  [.] urlscan.io: skipped (no API key)")

    return result


def _shodan_internetdb(ip, timeout):
    """Look up an IP on Shodan InternetDB. Free, no key required."""
    print(f"  [.] Querying Shodan InternetDB for {ip}...")
    try:
        resp = requests.get(
            f"https://internetdb.shodan.io/{ip}",
            timeout=timeout,
        )
        if resp.status_code == 200:
            data = resp.json()
            ports = data.get("ports", [])
            hostnames = data.get("hostnames", [])
            cpes = data.get("cpes", [])
            vulns = data.get("vulns", [])
            tags = data.get("tags", [])

            result = {
                "ip": ip,
                "ports": ports,
                "hostnames": hostnames,
                "cpes": cpes,
                "vulns": vulns,
                "tags": tags,
            }

            print(f"  [+] InternetDB: {len(ports)} open ports: {ports}")
            if hostnames:
                print(f"  [+] Hostnames: {', '.join(hostnames[:5])}")
            if cpes:
                print(f"  [+] CPEs: {', '.join(cpes[:5])}")
            if tags:
                print(f"  [+] Tags: {', '.join(tags)}")
            if vulns:
                print(f"  [+] Known vulns: {len(vulns)}")

            return result

        elif resp.status_code == 404:
            print(f"  [-] InternetDB: no data for {ip}")
        else:
            print(f"  [-] InternetDB: HTTP {resp.status_code}")

    except requests.RequestException as e:
        print(f"  [-] InternetDB error: {e}")

    return None


def _censys_lookup(ip, api_key, timeout):
    """Look up a host on Censys Platform API. Free tier allows host lookups."""
    print(f"  [.] Querying Censys for {ip}...")
    try:
        resp = requests.get(
            f"https://api.platform.censys.io/v2/hosts/{ip}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )
        if resp.status_code == 200:
            host = resp.json().get("result", {})

            services = []
            for svc in host.get("services", []):
                service_info = {
                    "port": svc.get("port"),
                    "service_name": svc.get("service_name", ""),
                    "transport": svc.get("transport_protocol", ""),
                }

                # TLS cert info
                tls = svc.get("tls", {})
                if tls:
                    leaf = tls.get("certificates", {}).get("leaf", {})
                    if leaf:
                        service_info["tls_subject"] = leaf.get("subject_dn", "")
                        service_info["tls_issuer"] = leaf.get("issuer_dn", "")

                # HTTP info
                http_resp = svc.get("http", {}).get("response", {})
                if http_resp:
                    service_info["http_status"] = http_resp.get("status_code")
                    service_info["http_title"] = http_resp.get("html_title", "")

                services.append(service_info)

            result = {
                "ip": ip,
                "services": services,
                "as_name": host.get("autonomous_system", {}).get("name", ""),
                "as_number": host.get("autonomous_system", {}).get("asn"),
                "country": host.get("location", {}).get("country", ""),
                "city": host.get("location", {}).get("city", ""),
            }

            print(f"  [+] Censys: {len(services)} services found")
            print(f"  [+] Censys AS: {result['as_name']} (AS{result['as_number']})")
            for svc in services[:5]:
                name = svc['service_name'] or 'unknown'
                print(f"  [+]   Port {svc['port']}: {name}")

            return result

        elif resp.status_code == 404:
            print(f"  [-] Censys: no data for {ip}")
        else:
            print(f"  [-] Censys: HTTP {resp.status_code}")

    except requests.RequestException as e:
        print(f"  [-] Censys error: {e}")

    return None


def _urlscan_search(domain, api_key, timeout):
    """Search urlscan.io for scans of a domain."""
    print(f"  [.] Searching urlscan.io for {domain}...")
    try:
        resp = requests.get(
            "https://urlscan.io/api/v1/search/",
            params={"q": f"domain:{domain}", "size": 5},
            headers={"API-Key": api_key},
            timeout=timeout,
        )
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])

            scans = []
            for r in results:
                page = r.get("page", {})
                scans.append({
                    "url": page.get("url", ""),
                    "domain": page.get("domain", ""),
                    "ip": page.get("ip", ""),
                    "server": page.get("server", ""),
                    "title": r.get("task", {}).get("reportURL", ""),
                    "time": r.get("task", {}).get("time", ""),
                    "asn": page.get("asn", ""),
                    "asnname": page.get("asnname", ""),
                })

            if scans:
                print(f"  [+] urlscan.io: {len(scans)} existing scans found")
                for s in scans[:3]:
                    print(f"  [+]   {s['url']} ({s['server'] or 'unknown'}) - {s['time']}")
            else:
                print(f"  [-] urlscan.io: no existing scans")

            return scans

        else:
            print(f"  [-] urlscan.io: HTTP {resp.status_code}")

    except requests.RequestException as e:
        print(f"  [-] urlscan.io error: {e}")

    return None
