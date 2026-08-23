#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_FILE="/etc/systemd/system/chapter1-todo-api.service"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl ca-certificates nodejs npm

cd "${SCRIPT_DIR}"
npm install

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Chapter 1 Todo API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable chapter1-todo-api.service
systemctl restart chapter1-todo-api.service

echo
echo "Installation complete."
echo "Main page : http://SERVER_IP:3000"
echo "Guide page: http://SERVER_IP:3000/guide"
echo "Health    : http://SERVER_IP:3000/api/health"
