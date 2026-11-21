#!/usr/bin/env python3
"""Receives Vox Folio dev reports (see src/dev/probe.ts) and prints them as JSON.

Usage: tools/probe_listener.py [port]   (default 8766). Ctrl+C to stop.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _emit(self, raw):
        try:
            print(json.dumps(json.loads(raw), indent=2), flush=True)
        except ValueError:
            print(raw, flush=True)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self._emit(self.rfile.read(length).decode("utf-8", "replace"))
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        data = parse_qs(urlparse(self.path).query).get("d")
        if data:
            self._emit(data[0])
        self.send_response(204)
        self._cors()
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print(f"listening on :{port}", flush=True)
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
