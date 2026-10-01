"""Local browser UI: serves one page and runs CLI commands, streaming their output."""
import json
import os
import sys
import threading
import traceback
import webbrowser
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import cli

with open(os.path.join(os.path.dirname(__file__), "web.html"), encoding="utf-8") as f:
    PAGE = f.read().encode("utf-8")

# ponytail: one command at a time because stdout is redirected process-wide;
# per-job output capture if running scans in parallel ever matters
_lock = threading.Lock()


class _Stream:
    """File-like object that forwards print() output to the HTTP response."""

    def __init__(self, wfile):
        self.wfile = wfile

    def write(self, s):
        try:
            self.wfile.write(s.encode("utf-8"))
        except OSError:
            pass  # browser tab closed: keep running so the scan still gets saved
        return len(s)

    def flush(self):
        pass


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, body, content_type="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _trusted(self):
        # Host check blocks DNS-rebinding; JSON content type forces a CORS preflight
        # (which we never answer), so other websites can't drive this server.
        return self.headers.get("Host") in self.server.allowed_hosts

    def do_GET(self):
        if not self._trusted() or self.path != "/":
            return self._reply(404, b"Not found")
        self._reply(200, PAGE, "text/html; charset=utf-8")

    def do_POST(self):
        if (not self._trusted() or self.path != "/run"
                or self.headers.get("Content-Type") != "application/json"):
            return self._reply(403, b"Forbidden")
        try:
            argv = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if not (isinstance(argv, list) and argv and all(isinstance(a, str) for a in argv)) or argv[0] == "web":
                raise ValueError
        except ValueError:
            return self._reply(400, b"Bad request")

        if not _lock.acquire(blocking=False):
            return self._reply(409, b"Another command is still running. Wait for it to finish.")
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            out = _Stream(self.wfile)
            with redirect_stdout(out), redirect_stderr(out):
                try:
                    args = cli.build_parser().parse_args(argv)
                    args.func(args)
                except SystemExit as e:
                    if isinstance(e.code, str):
                        print(e.code)
                except Exception:
                    traceback.print_exc()
        finally:
            _lock.release()

    def log_message(self, *args):
        pass


def serve(port=8765, open_browser=True):
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        sys.exit(f"Port {port} is already in use. Is it already running? Otherwise try --port {port + 1}")
    server.allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    url = f"http://127.0.0.1:{port}/"
    print(f"\n  IPTV Fingerprint is running at {url}")
    print(f"  Saved data: {cli.config.DATA_DIR}")
    print(f"  Press Ctrl+C to stop.\n")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
