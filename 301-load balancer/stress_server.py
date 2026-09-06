#!/usr/bin/env python3

import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


HOST = "127.0.0.1"
PORT = 8081
TOKEN = os.environ.get("LAB_STRESS_TOKEN", "asg-lab")
STRESS_SECONDS = max(5, min(int(os.environ.get("LAB_STRESS_SECONDS", "20")), 60))

process_lock = threading.Lock()
stress_process = None


def start_stress():
    global stress_process

    with process_lock:
        if stress_process is not None and stress_process.poll() is None:
            return {
                "status": "running",
                "stressRunning": True,
                "stressPid": stress_process.pid,
                "exitCode": None,
            }

        stress_process = subprocess.Popen(
            [
                "/usr/bin/stress-ng",
                "--cpu",
                "0",
                "--cpu-method",
                "matrixprod",
                "--cpu-load",
                "90",
                "--timeout",
                f"{STRESS_SECONDS}s",
            ],
            start_new_session=True,
        )

        # Do not report success when stress-ng fails during initialization.
        time.sleep(0.25)
        exit_code = stress_process.poll()
        return {
            "status": "started" if exit_code is None else "failed",
            "stressRunning": exit_code is None,
            "stressPid": stress_process.pid,
            "exitCode": exit_code,
        }


def get_stress_status():
    with process_lock:
        exit_code = stress_process.poll() if stress_process is not None else None
        running = stress_process is not None and exit_code is None
        pid = stress_process.pid if stress_process is not None else None

    return {
        "status": "ok",
        "hostname": os.uname().nodename,
        "stressRunning": running,
        "stressPid": pid,
        "exitCode": exit_code,
        "loadAverage1m": round(os.getloadavg()[0], 2),
    }


class StressHandler(BaseHTTPRequestHandler):
    def send_json(self, status_code, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            self.send_json(200, {"status": "ok"})
            return

        if path not in {"/stress", "/stress-status"}:
            self.send_json(404, {"error": "not_found"})
            return

        if self.headers.get("X-Lab-Token") != TOKEN:
            self.send_json(403, {"error": "forbidden"})
            return

        if path == "/stress-status":
            self.send_json(200, get_stress_status())
            return

        result = start_stress()
        self.send_json(
            200 if result["stressRunning"] else 500,
            {
                "status": result["status"],
                "hostname": os.uname().nodename,
                "durationSeconds": STRESS_SECONDS,
                "stressRunning": result["stressRunning"],
                "stressPid": result["stressPid"],
                "exitCode": result["exitCode"],
            },
        )

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), StressHandler).serve_forever()
