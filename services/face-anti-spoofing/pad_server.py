"""Loopback-only PAD service; temporary bounded child, no disk uploads or request logging."""
import argparse
import json
import os
import secrets
import socket
import select
import sys
import threading
import uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pad_inference import pad_child, detector_bytes
from mn3_offline import DEFAULT_MODEL, Mn3CpuAdapter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "face-experiment"))
from server import run_bounded  # Existing spawn/deadline/terminate boundary; no identity server startup.
from inference import MAX_FILE

class PadServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 2
    def __init__(self, address, key):
        if address[0] != "127.0.0.1" or len(key) < 32:
            raise ValueError("Loopback and internal key required")
        super().__init__(address, Handler)
        self.key = key
        self.busy = threading.BoundedSemaphore(1)
        self.connections = threading.BoundedSemaphore(4)
    def process_request(self, request, address):
        if not self.connections.acquire(False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.connections.release()
            raise
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.connections.release()
    def handle_error(self, *_):
        pass

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)
    def log_message(self, *_):
        pass
    def reply(self, status, value):
        body = json.dumps(value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(body)
        except (OSError, ConnectionError):
            pass
    def authorized(self):
        if not secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.key):
            self.reply(401, {"code": "INTERNAL_AUTH_REQUIRED"})
            return False
        return True
    def do_GET(self):
        if self.authorized():
            self.reply(200 if self.path == "/health" else 404, {"ready": self.path == "/health"})
    def do_POST(self):
        if not self.authorized():
            return
        if self.path != "/inspect":
            self.reply(404, {"code": "NOT_FOUND"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type") != "application/octet-stream" or not 6 <= length <= MAX_FILE + 260:
            self.reply(413, {"code": "FACE_INPUT_LIMIT"})
            return
        if not self.server.busy.acquire(False):
            self.reply(503, {"code": "PAD_BUSY"})
            return
        payload = None
        try:
            payload = self.rfile.read(length)
            header_length = int.from_bytes(payload[:4], "big")
            if len(payload) != length or not 1 <= header_length <= 256 or not 0 < length - 4 - header_length <= MAX_FILE:
                self.reply(400, {"code": "FACE_IMAGE_INVALID"})
                return
            meta = json.loads(payload[4:4 + header_length])
            if set(meta) != {"requestId", "slot"} or str(uuid.UUID(meta["requestId"])) != meta["requestId"] or meta["slot"] not in ("A", "B"):
                self.reply(400, {"code": "PAD_REQUEST_INVALID"})
                return
            def disconnected():
                try:
                    return bool(select.select([self.connection], [], [], 0)[0]) and self.connection.recv(1, socket.MSG_PEEK) == b""
                except OSError:
                    return True
            result = run_bounded(payload[4 + header_length:], target=pad_child, cancelled=disconnected)
            if "status" not in result:
                result = {"status": "ERROR", "reason": "PAD_TIMEOUT" if result.get("code") == "FACE_TIMEOUT" else "PAD_PROCESS_FAILED", "probabilities": None, "prediction": None, "diagnostics": None}
            self.reply(200, {**result, **meta})
        except (socket.timeout, ConnectionError):
            self.reply(408, {"code": "PAD_TIMEOUT"})
        except Exception:
            self.reply(400, {"code": "PAD_REQUEST_INVALID"})
        finally:
            payload = None
            self.server.busy.release()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    key = os.environ.get("FACE_PAD_INTERNAL_KEY", "")
    if len(key) < 32:
        raise SystemExit("Set FACE_PAD_INTERNAL_KEY to a random value of at least 32 characters.")
    try:
        detector_bytes()
        adapter = Mn3CpuAdapter(DEFAULT_MODEL)
        del adapter
    except Exception:
        raise SystemExit("PAD assets unavailable or invalid; startup refused.") from None
    server = PadServer(("127.0.0.1", args.port), key)
    print("PAD ready on loopback; request logging disabled.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
