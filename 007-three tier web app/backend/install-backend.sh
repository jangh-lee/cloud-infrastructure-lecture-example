#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install-backend.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/chapter3-backend"
SERVICE_FILE="/etc/systemd/system/chapter3-backend.service"
SEEDER_SERVICE_FILE="/etc/systemd/system/chapter3-post-seeder.service"
RAW_BASE="https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/007-three%20tier%20web%20app/backend/app"
COMMAND="${1:-install}"

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
AUTO_POST_ENABLED=${AUTO_POST_ENABLED:-false}
AUTO_POST_INTERVAL_SECONDS=${AUTO_POST_INTERVAL_SECONDS:-60}
AUTO_POST_TOTAL=${AUTO_POST_TOTAL:-300}
AUTO_POST_API_URL=${AUTO_POST_API_URL:-http://127.0.0.1:${PORT:-4000}/api/posts}
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
AUTO_POST_ENABLED=false
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:4000/api/posts
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

write_service_files() {
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

  cat > "${SEEDER_SERVICE_FILE}" <<EOF
[Unit]
Description=Chapter 3 sample post seeder
After=chapter3-backend.service
Requires=chapter3-backend.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/seed-worker.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

sync_app_files() {
  mkdir -p "${APP_DIR}"

  copy_or_fetch_file "${SCRIPT_DIR}/app/package.json" "${APP_DIR}/package.json" "package.json"
  copy_or_fetch_file "${SCRIPT_DIR}/app/server.js" "${APP_DIR}/server.js" "server.js"
  copy_or_fetch_file "${SCRIPT_DIR}/app/seed-worker.js" "${APP_DIR}/seed-worker.js" "seed-worker.js"
  cp "${SCRIPT_DIR}/.env" "${APP_DIR}/.env"
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
    apt-get update
    apt-get install -y curl ca-certificates nodejs npm
  fi
}

install_node_dependencies() {
  cd "${APP_DIR}"

  if [[ ! -d node_modules ]]; then
    npm install --omit=dev
    return
  fi

  if [[ package.json -nt node_modules || package-lock.json -nt node_modules ]]; then
    npm install --omit=dev
  fi
}

restart_services() {
  systemctl daemon-reload
  systemctl enable chapter3-backend.service
  systemctl restart chapter3-backend.service

  if grep -Eq '^AUTO_POST_ENABLED="?true"?' "${APP_DIR}/.env"; then
    mkdir -p /var/lib/chapter3-post-seeder
    systemctl enable chapter3-post-seeder.service
    systemctl restart chapter3-post-seeder.service
  else
    systemctl disable chapter3-post-seeder.service >/dev/null 2>&1 || true
    systemctl stop chapter3-post-seeder.service >/dev/null 2>&1 || true
  fi
}

ensure_env_file

case "${COMMAND}" in
  install)
    install_packages
    sync_app_files
    install_node_dependencies
    write_service_files
    restart_services
    ;;
  configure)
    if [[ ! -d "${APP_DIR}" ]]; then
      echo "${APP_DIR} does not exist. Run: sudo ./install-backend.sh install"
      exit 1
    fi
    sync_app_files
    write_service_files
    restart_services
    ;;
  restart)
    restart_services
    ;;
  status)
    systemctl status chapter3-backend.service --no-pager || true
    systemctl status chapter3-post-seeder.service --no-pager || true
    exit 0
    ;;
  *)
    echo "Usage: sudo ./install-backend.sh [install|configure|restart|status]"
    exit 1
    ;;
esac

echo
echo "Backend installation complete."
echo "API health : http://SERVER_PRIVATE_OR_PUBLIC_IP:4000/api/health"
echo "Posts API  : http://SERVER_PRIVATE_OR_PUBLIC_IP:4000/api/posts"
echo "Auto posts : set AUTO_POST_ENABLED=true in ${SCRIPT_DIR}/.env and rerun this script"
