"""Loopback-only internal service; no CORS, request logging, disk uploads or sessions."""
import argparse
import json
import multiprocessing as mp
import os
import secrets
import socket
import select
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from download_models import verify_models
from inference import inference_child, MAX_FILE, model_provenance

DEADLINE_SECONDS = 12

def run_bounded(payload, timeout=DEADLINE_SECONDS, target=inference_child, cancelled=lambda: False):
    context = mp.get_context("spawn")
    parent, child = context.Pipe(duplex=False)
    process = context.Process(target=target, args=(payload, child), daemon=True)
    try:
        process.start(); child.close()
        deadline = time.monotonic() + timeout
        while not parent.poll(0.05):
            if cancelled() or time.monotonic() >= deadline:
                return {"ok": False, "code": "FACE_TIMEOUT"}
        return parent.recv()
    except Exception:
        return {"ok": False, "code": "FACE_PROCESS_FAILED"}
    finally:
        if process.pid is not None:
            if process.is_alive(): process.terminate()
            process.join(timeout=2)
            if process.is_alive(): process.kill(); process.join(timeout=2)
            process.close()
        parent.close(); child.close()

class InternalServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 2
    def __init__(self, address, key):
        super().__init__(address, Handler)
        self.key = key
        self.provenance = model_provenance(verify_models())
        self.busy = threading.BoundedSemaphore(1)
        self.connections = threading.BoundedSemaphore(4)
    def process_request(self, request, address):
        if not self.connections.acquire(blocking=False):
            self.shutdown_request(request); return
        try: super().process_request(request, address)
        except Exception: self.connections.release(); raise
    def process_request_thread(self, request, address):
        try: super().process_request_thread(request, address)
        finally: self.connections.release()
    def handle_error(self, request, client_address):
        pass # Never log payloads, identities, authorization headers or raw exceptions.

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup(); self.connection.settimeout(10)
    def log_message(self, *_): pass
    def reply(self, status, value):
        if self.path == "/compare" and self.headers.get("Authorization") == "Bearer " + self.server.key and not value.get("ok"):
            value = {**value, "provenance": self.server.provenance}
        body = json.dumps(value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close"); self.end_headers()
        self.close_connection = True
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass
    def authorized(self):
        if not secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.key):
            self.reply(401, {"code": "INTERNAL_AUTH_REQUIRED"}); return False
        return True
    def do_GET(self):
        if not self.authorized(): return
        self.reply(200 if self.path == "/health" else 404, {"ready": self.path == "/health"})
    def do_POST(self):
        if not self.authorized(): return
        if self.path != "/compare": self.reply(404, {"code": "NOT_FOUND"}); return
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: length = 0
        if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type") != "application/octet-stream" or not 6 <= length <= 2 * MAX_FILE + 4:
            self.reply(413, {"code": "FACE_INPUT_LIMIT"}); return
        if not self.server.busy.acquire(blocking=False):
            self.reply(503, {"code": "FACE_BUSY"}); return
        payload = None
        try:
            payload = self.rfile.read(length)
            a = int.from_bytes(payload[:4], "big")
            if len(payload) != length or not 0 < a <= MAX_FILE or not 0 < length - 4 - a <= MAX_FILE:
                self.reply(400, {"code": "FACE_IMAGE_INVALID"}); return
            def disconnected():
                try:
                    return bool(select.select([self.connection], [], [], 0)[0]) and self.connection.recv(1, socket.MSG_PEEK) == b""
                except OSError:
                    return True
            result = run_bounded(payload, cancelled=disconnected)
            code = result.get("code")
            self.reply(200 if result.get("ok") else 504 if code == "FACE_TIMEOUT" else 422 if code in ("FACE_NONE", "FACE_MULTIPLE", "FACE_IMAGE_INVALID", "FACE_INPUT_LIMIT") else 503, result)
        except (socket.timeout, ConnectionError):
            self.reply(408, {"code": "FACE_TIMEOUT"})
        except Exception:
            self.reply(503, {"code": "FACE_PROCESS_FAILED"})
        finally:
            payload = None; self.server.busy.release()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    key = os.environ.get("FACE_EXPERIMENT_INTERNAL_KEY", "")
    if len(key) < 32: raise SystemExit("Set FACE_EXPERIMENT_INTERNAL_KEY to a random value of at least 32 characters.")
    verify_models()
    server = InternalServer(("127.0.0.1", args.port), key)
    print("Face experiment ready on loopback; request logging disabled.", flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
