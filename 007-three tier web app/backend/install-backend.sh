#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install-backend.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/chapter3-backend"
SERVICE_FILE="/etc/systemd/system/chapter3-backend.service"
RAW_BASE="https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/007-three%20tier%20web%20app/backend/app"

ensure_env_file() {
  if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    return
  fi

  if [[ -n "${DB_HOST:-}" && -n "${DB_NAME:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${FRONTEND_ORIGIN:-}" ]]; then
    cat > "${SCRIPT_DIR}/.env" <<EOF
PORT=${PORT:-4000}
FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
EOF
    return
  fi

  cat > "${SCRIPT_DIR}/.env" <<'EOF'
PORT=4000
FRONTEND_ORIGIN=http://WEB_SERVER_PUBLIC_IP
DB_HOST=DB_SERVER_PRIVATE_IP
DB_PORT=3306
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=ChangeThisPassword123!
EOF
  echo "Created ${SCRIPT_DIR}/.env template. Fill it out and run again."
  exit 1
}

copy_or_fetch_file() {
  local source_path="$1"
  local target_path="$2"
  local remote_name="$3"

  if [[ -f "${source_path}" ]]; then
    cp "${source_path}" "${target_path}"
  else
    curl -fsSL "${RAW_BASE}/${remote_name}" -o "${target_path}"
  fi
}

ensure_env_file

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates nodejs npm

mkdir -p "${APP_DIR}"

copy_or_fetch_file "${SCRIPT_DIR}/app/package.json" "${APP_DIR}/package.json" "package.json"
copy_or_fetch_file "${SCRIPT_DIR}/app/server.js" "${APP_DIR}/server.js" "server.js"
cp "${SCRIPT_DIR}/.env" "${APP_DIR}/.env"

cd "${APP_DIR}"
npm install --omit=dev

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Chapter 3 Backend API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable chapter3-backend.service
systemctl restart chapter3-backend.service

echo
echo "Backend installation complete."
echo "API health : http://SERVER_PRIVATE_OR_PUBLIC_IP:4000/api/health"
echo "Posts API  : http://SERVER_PRIVATE_OR_PUBLIC_IP:4000/api/posts"
