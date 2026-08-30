#!/usr/bin/env bash

set -euo pipefail

WEB_ROOT="/var/www/lb-demo"
STATUS_FILE="${WEB_ROOT}/status.json"

HOSTNAME_VALUE="$(hostname)"
PRIMARY_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
ALL_IPS="$(hostname -I 2>/dev/null | xargs)"
DATE_VALUE="$(date '+%Y-%m-%d')"
TIME_VALUE="$(date '+%H:%M:%S %Z')"
SERVER_NAME="$(sed -n 's|.*<span class="value" id="serverName">\([^<]*\)</span>.*|\1|p' "${WEB_ROOT}/index.html" | head -n 1)"

cat > "${STATUS_FILE}" <<EOF
{
  "date": "${DATE_VALUE}",
  "time": "${TIME_VALUE}",
  "serverName": "${SERVER_NAME}",
  "hostname": "${HOSTNAME_VALUE}",
  "primaryIp": "${PRIMARY_IP}",
  "allIps": "${ALL_IPS}"
}
EOF
