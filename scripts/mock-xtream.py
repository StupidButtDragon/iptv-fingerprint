#!/usr/bin/env python3
"""Mock Xtream API for end-to-end testing of the collect pipeline.

Serves player_api.php + get.php shaped like a real provider, with stream and
category IDs taken from the shipped T-Rex profile so a scan of this mock
should score a MATCH against T-Rex (minus the DNS signal, since the host is
localhost).

Usage: python3 scripts/mock-xtream.py [port]
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8081

with open("iptv_fingerprint/analysis/known_providers.json", encoding="utf-8") as f:
    TREX = json.load(f)["trex"]

CAT_IDS = TREX["sample_category_ids"][:12]
CAT_NAMES = TREX["category_names_ordered"][:9] + [
    "|US| Documentary",
    "|CA| French",
    "|XX| Radio",
]
STREAM_IDS = TREX["sample_stream_ids"] + [str(500000 + i) for i in range(1970)]
LOGOS = TREX["logo_domains"] or ["103.176.90.118"]

CATEGORIES = [
    {"category_id": cid, "category_name": CAT_NAMES[i]}
    for i, cid in enumerate(CAT_IDS)
]

STREAMS = []
for i, sid in enumerate(STREAM_IDS):
    cat = CATEGORIES[i % len(CATEGORIES)]
    STREAMS.append(
        {
            "stream_id": sid,
            "name": f"{cat['category_name']} CH {i:03d}",
            "category_id": cat["category_id"],
            "epg_channel_id": f"epg.{sid}.mock",
            "stream_icon": f"http://{LOGOS[i % len(LOGOS)]}/logo/{i}.png",
        }
    )

VOD_CATEGORIES = [{"category_id": f"v{i}", "category_name": n} for i, n in enumerate(["Movies", "Series", "Kids"])]
VOD_STREAMS = [{"name": f"Mock Movie {i}", "stream_id": 900000 + i} for i in range(60)]
SERIES_CATEGORIES = [{"category_id": f"s{i}", "category_name": n} for i, n in enumerate(["Drama", "Comedy"])]

AUTH = {
    "user_info": {
        "username": "demo",
        "status": "Active",
        "auth": 1,
        "exp_date": None,
        "is_trial": "1",
        "active_cons": "1",
        "max_connections": "1",
    },
    "server_info": {
        "url": f"localhost:{PORT}",
        "port": str(PORT),
        "timezone": "Europe/Amsterdam",
        "timestamp": 1717000000,
    },
}


class Handler(BaseHTTPRequestHandler):
    server_version = "nginx/1.24.0"
    sys_version = ""

    def _send(self, body: bytes, content_type: str = "application/json"):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_json(self, data):
        self._send(json.dumps(data).encode("utf-8"))

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path.endswith("get.php"):
            body = '#EXTM3U url-tvg="http://epg.mock/guide.xml"\n#EXTINF:-1 tvg-id="x" Mock, Mock TV\nhttp://localhost/live/demo/demo/1.ts\n'
            self._send(body.encode("utf-8"), "application/x-mpegURL")
            return

        if parsed.path.endswith("player_api.php") or parsed.path.endswith("api.php"):
            action = (qs.get("action") or [None])[0]
            if action is None:
                self._send_json(AUTH)
            elif action == "get_live_categories":
                self._send_json(CATEGORIES)
            elif action == "get_live_streams":
                self._send_json(STREAMS)
            elif action == "get_vod_categories":
                self._send_json(VOD_CATEGORIES)
            elif action == "get_vod_streams":
                self._send_json(VOD_STREAMS)
            elif action == "get_series_categories":
                self._send_json(SERIES_CATEGORIES)
            else:
                self._send_json([])
            return

        # Root / anything else: plain landing for header probes
        self._send(b"<html><body>mock xtream</body></html>", "text/html")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"mock xtream listening on {PORT}", flush=True)
    server.serve_forever()
