#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lb-demo}"
WEB_ROOT="${WEB_ROOT:-/var/www/lb-demo}"
STATUS_FILE="${WEB_ROOT}/status.json"
DISPLAY_NAME_FILE="${APP_DIR}/display-name"

HOSTNAME_VALUE="${HOSTNAME_VALUE:-$(hostname)}"
PRIMARY_IP="${PRIMARY_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
ALL_IPS="${ALL_IPS:-$(hostname -I 2>/dev/null | xargs)}"
DATE_VALUE="$(date '+%Y-%m-%d')"
TIME_VALUE="$(date '+%H:%M:%S %Z')"
SERVER_NAME="$(cat "${DISPLAY_NAME_FILE}" 2>/dev/null || printf 'Load Balancer Lab')"

python3 - \
  "${STATUS_FILE}" \
  "${DATE_VALUE}" \
  "${TIME_VALUE}" \
  "${SERVER_NAME}" \
  "${HOSTNAME_VALUE}" \
  "${PRIMARY_IP}" \
  "${ALL_IPS}" <<'PY'
import json
import pathlib
import sys

status_file, date, time, server_name, hostname, primary_ip, all_ips = sys.argv[1:]
payload = {
    "date": date,
    "time": time,
    "serverName": server_name,
    "hostname": hostname,
    "primaryIp": primary_ip,
    "allIps": all_ips,
}
target = pathlib.Path(status_file)
temporary = target.with_name(f".{target.name}.tmp")
temporary.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
temporary.replace(target)
PY
