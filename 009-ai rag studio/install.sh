#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_FILE="/etc/systemd/system/chapter4-ai-demo.service"

ensure_env_file() {
  if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    return
  fi

  cat > "${SCRIPT_DIR}/.env" <<'EOF'
PORT=4100
CLOVA_BASE_URL="https://clovastudio.stream.ntruss.com"
CLOVA_API_KEY=""
CLOVA_TEXT_MODEL="HCX-DASH-002"
ADMIN_PASSWORD="change-me"
DEMO_MODE_IF_NO_KEY="true"
EOF
  echo "Created ${SCRIPT_DIR}/.env template. Fill it out and run again."
  exit 1
}

ensure_env_file

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates nodejs npm

cd "${SCRIPT_DIR}"
npm install

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Chapter 4 AI Fortune and RAG Demo
After=network.target

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable chapter4-ai-demo.service
systemctl restart chapter4-ai-demo.service

echo
echo "Installation complete."
echo "Open browser: http://SERVER_IP:4100"
