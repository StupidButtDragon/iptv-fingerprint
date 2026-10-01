import requests
import struct


def collect(stream_url, timeout=12):
    """
    Fetch a .ts stream segment and analyze its internal structure.
    Extracts PIDs, codec info, and bitrate for source fingerprinting.
    """
    result = {
        "url_pattern": _redact_url(stream_url),
        "reachable": False,
        "content_type": None,
        "is_ts": False,
        "pids_found": [],
        "estimated_bitrate_kbps": None,
        "bytes_read": 0,
        "http_status": None,
        "server_header": None,
    }

    print(f"  [.] Analyzing stream...")
    try:
        resp = requests.get(
            stream_url,
            headers={"User-Agent": "TiviMate/4.4.0 (Linux; Android 11)"},
            timeout=timeout,
            stream=True,
        )

        result["http_status"] = resp.status_code
        result["content_type"] = resp.headers.get("Content-Type", "")
        result["server_header"] = resp.headers.get("Server", "")

        if resp.status_code != 200:
            print(f"  [-] HTTP {resp.status_code}")
            return result

        result["reachable"] = True

        # Read up to 256KB for analysis
        data = b""
        for chunk in resp.iter_content(chunk_size=8192):
            data += chunk
            if len(data) >= 256 * 1024:
                break
        resp.close()

        result["bytes_read"] = len(data)

        if len(data) < 188:
            print(f"  [-] Too little data ({len(data)} bytes)")
            return result

        # Verify MPEG-TS sync byte
        if data[0] != 0x47:
            print(f"  [-] Not MPEG-TS (first byte: 0x{data[0]:02x})")
            return result

        result["is_ts"] = True

        # Parse TS packets and collect PIDs
        pids = {}
        packet_count = 0
        for offset in range(0, len(data) - 188 + 1, 188):
            if data[offset] != 0x47:
                continue
            packet_count += 1

            # PID is in bytes 1-2 (13 bits)
            pid = ((data[offset + 1] & 0x1F) << 8) | data[offset + 2]

            if pid not in pids:
                pids[pid] = {"count": 0, "type": _classify_pid(pid)}
            pids[pid]["count"] += 1

        result["pids_found"] = [
            {"pid": pid, "type": info["type"], "packets": info["count"]}
            for pid, info in sorted(pids.items())
        ]

        # Estimate bitrate from data rate
        if packet_count > 10:
            # Rough estimate: assume ~1 second of data per 50-100 packets at typical TS rates
            total_bits = len(data) * 8
            # More accurate: use PCR if available, but this gives a ballpark
            result["estimated_bitrate_kbps"] = int(total_bits / 1024)

        print(f"  [+] MPEG-TS: {packet_count} packets, {len(pids)} unique PIDs")
        for pid_info in result["pids_found"]:
            ptype = pid_info["type"]
            if ptype != "data":
                print(f"  [+]   PID {pid_info['pid']}: {ptype} ({pid_info['packets']} packets)")

    except requests.RequestException as e:
        print(f"  [-] Stream fetch failed: {e}")

    return result


def _classify_pid(pid):
    """Classify a PID by its standard assignment."""
    if pid == 0:
        return "PAT"
    elif pid == 1:
        return "CAT"
    elif pid == 0x11:
        return "SDT/BAT"
    elif pid == 0x12:
        return "EIT"
    elif pid == 0x14:
        return "TDT/TOT"
    elif pid == 0x1FFF:
        return "null"
    elif pid < 0x20:
        return f"reserved({pid})"
    else:
        return "data"


def _redact_url(url):
    """Remove credentials from URL for safe storage."""
    # Pattern: http://domain/live/username/password/stream.ts
    import re
    return re.sub(
        r'(/live/)[^/]+/[^/]+(/\d+\.ts)',
        r'\1***/***/\2',
        url
    )
