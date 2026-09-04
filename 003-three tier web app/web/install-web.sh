#!/usr/bin/env bash

set -euo pipefail

cleanup() {
  if [[ -n "${TEMP_POLICY_RC_D:-}" && -f "${TEMP_POLICY_RC_D}" ]]; then
    rm -f "${TEMP_POLICY_RC_D}"
  fi
}

trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install-web.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/board-service-web"
WEB_ROOT="/var/www/board-service-web"
NGINX_CONF="/etc/nginx/sites-available/board-service-web"
NGINX_LINK="/etc/nginx/sites-enabled/board-service-web"
RAW_BASE="https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/003-three%20tier%20web%20app/web/app"
TEMP_POLICY_RC_D=""
COMMAND="${1:-install}"

ensure_env_file() {
  if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    return
  fi

  if [[ -n "${SITE_BASE_URL:-}" && ( -n "${BACKEND_UPSTREAM:-}" || -n "${BACKEND_BASE_URL:-}" ) ]]; then
    local backend_upstream="${BACKEND_UPSTREAM:-${BACKEND_BASE_URL}}"
    cat > "${SCRIPT_DIR}/.env" <<EOF
SITE_BASE_URL="${SITE_BASE_URL}"
BACKEND_UPSTREAM="${backend_upstream}"
SITE_TITLE="${SITE_TITLE:-DevForum Practice Board}"
EOF
    return
  fi

  cat > "${SCRIPT_DIR}/.env" <<'EOF'
SITE_BASE_URL="http://WEB_SERVER_PUBLIC_IP"
BACKEND_UPSTREAM="http://BACKEND_SERVER_PRIVATE_IP:4000"
SITE_TITLE="DevForum Practice Board"
EOF
  echo "Created ${SCRIPT_DIR}/.env template. Fill it out and run again."
  exit 1
}

load_env() {
  set -a
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
  set +a

  # Existing labs can be reconfigured before renaming the old variable.
  if [[ -z "${BACKEND_UPSTREAM:-}" && -n "${BACKEND_BASE_URL:-}" ]]; then
    BACKEND_UPSTREAM="${BACKEND_BASE_URL}"
    echo "BACKEND_BASE_URL is deprecated. Rename it to BACKEND_UPSTREAM in ${SCRIPT_DIR}/.env."
  fi

  if [[ -z "${SITE_BASE_URL:-}" || -z "${BACKEND_UPSTREAM:-}" ]]; then
    echo "SITE_BASE_URL and BACKEND_UPSTREAM must be set in ${SCRIPT_DIR}/.env"
    exit 1
  fi

  BACKEND_UPSTREAM="${BACKEND_UPSTREAM%/}"
  if [[ "${BACKEND_UPSTREAM}" != http://* && "${BACKEND_UPSTREAM}" != https://* ]]; then
    echo "BACKEND_UPSTREAM must start with http:// or https://"
    exit 1
  fi
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

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update

  # Prevent package post-install hooks from auto-starting the default nginx config.
  if [[ ! -e /usr/sbin/policy-rc.d ]]; then
    TEMP_POLICY_RC_D="/usr/sbin/policy-rc.d"
    cat > "${TEMP_POLICY_RC_D}" <<'EOF'
#!/bin/sh
exit 101
EOF
    chmod 755 "${TEMP_POLICY_RC_D}"
  fi

  apt-get install -y nginx curl
}

case "${COMMAND}" in
  install)
    ensure_env_file
    load_env
    install_packages
    ;;
  configure)
    ensure_env_file
    load_env
    if ! command -v nginx >/dev/null 2>&1; then
      echo "nginx is not installed. Run: sudo ./install-web.sh install"
      exit 1
    fi
    ;;
  status)
    systemctl status nginx --no-pager || true
    nginx -t || true
    exit 0
    ;;
  *)
    echo "Usage: sudo ./install-web.sh [install|configure|status]"
    exit 1
    ;;
esac


mkdir -p "${APP_DIR}" "${WEB_ROOT}"

copy_or_fetch_file "${SCRIPT_DIR}/app/index.html" "${APP_DIR}/index.html" "index.html"
copy_or_fetch_file "${SCRIPT_DIR}/app/styles.css" "${APP_DIR}/styles.css" "styles.css"
copy_or_fetch_file "${SCRIPT_DIR}/app/app.js" "${APP_DIR}/app.js" "app.js"

cp "${APP_DIR}/index.html" "${WEB_ROOT}/index.html"
cp "${APP_DIR}/styles.css" "${WEB_ROOT}/styles.css"
cp "${APP_DIR}/app.js" "${WEB_ROOT}/app.js"

cat > "${WEB_ROOT}/config.js" <<EOF
window.BOARD_SERVICE_CONFIG = {
  SITE_BASE_URL: "${SITE_BASE_URL}",
  SITE_TITLE: "${SITE_TITLE:-DevForum Practice Board}"
};
EOF

cat > "${NGINX_CONF}" <<EOF
server {
    listen 80 default_server;
    server_name _;

    root ${WEB_ROOT};
    index index.html;
    add_header X-Web-Instance \$hostname always;

    location = /healthz {
        default_type text/plain;
        return 200 "ok\n";
    }

    location = /web-instance {
        default_type application/json;
        return 200 '{"instance":"\$hostname","privateIp":"\$server_addr","service":"board-service-web"}';
    }

    location /api/ {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/chapter3-web
ln -sf "${NGINX_CONF}" "${NGINX_LINK}"

nginx -t

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl enable nginx
  systemctl restart nginx
else
  service nginx restart
fi

echo
echo "Web server configuration complete."
echo "Site URL     : ${SITE_BASE_URL}"
echo "API path     : ${SITE_BASE_URL%/}/api"
echo "API upstream : ${BACKEND_UPSTREAM}"
echo "ALB health   : ${SITE_BASE_URL%/}/healthz"
echo "Web instance : ${SITE_BASE_URL%/}/web-instance"
echo "Open browser : http://SERVER_PUBLIC_IP/"
