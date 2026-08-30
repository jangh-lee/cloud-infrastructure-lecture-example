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
APP_DIR="/opt/chapter3-web"
WEB_ROOT="/var/www/chapter3-web"
NGINX_CONF="/etc/nginx/sites-available/chapter3-web"
NGINX_LINK="/etc/nginx/sites-enabled/chapter3-web"
RAW_BASE="https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/003-three%20tier%20web%20app/web/app"
TEMP_POLICY_RC_D=""

ensure_env_file() {
  if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    return
  fi

  if [[ -n "${SITE_BASE_URL:-}" && -n "${BACKEND_BASE_URL:-}" ]]; then
    cat > "${SCRIPT_DIR}/.env" <<EOF
SITE_BASE_URL="${SITE_BASE_URL}"
BACKEND_BASE_URL="${BACKEND_BASE_URL}"
SITE_TITLE="${SITE_TITLE:-DevForum Practice Board}"
EOF
    return
  fi

  cat > "${SCRIPT_DIR}/.env" <<'EOF'
SITE_BASE_URL="http://WEB_SERVER_PUBLIC_IP"
BACKEND_BASE_URL="http://BACKEND_SERVER_PRIVATE_OR_PUBLIC_IP:4000"
SITE_TITLE="DevForum Practice Board"
EOF
  echo "Created ${SCRIPT_DIR}/.env template. Fill it out and run again."
  exit 1
}

load_env() {
  set -a
  source "${SCRIPT_DIR}/.env"
  set +a
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
load_env

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

mkdir -p "${APP_DIR}" "${WEB_ROOT}"

copy_or_fetch_file "${SCRIPT_DIR}/app/index.html" "${APP_DIR}/index.html" "index.html"
copy_or_fetch_file "${SCRIPT_DIR}/app/styles.css" "${APP_DIR}/styles.css" "styles.css"
copy_or_fetch_file "${SCRIPT_DIR}/app/app.js" "${APP_DIR}/app.js" "app.js"

cp "${APP_DIR}/index.html" "${WEB_ROOT}/index.html"
cp "${APP_DIR}/styles.css" "${WEB_ROOT}/styles.css"
cp "${APP_DIR}/app.js" "${WEB_ROOT}/app.js"

cat > "${WEB_ROOT}/config.js" <<EOF
window.CHAPTER3_CONFIG = {
  SITE_BASE_URL: "${SITE_BASE_URL}",
  BACKEND_BASE_URL: "${BACKEND_BASE_URL}",
  SITE_TITLE: "${SITE_TITLE:-DevForum Practice Board}"
};
EOF

cat > "${NGINX_CONF}" <<EOF
server {
    listen 80 default_server;
    server_name _;

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf "${NGINX_CONF}" "${NGINX_LINK}"

nginx -t

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl enable nginx
  systemctl restart nginx
else
  service nginx restart
fi

echo
echo "Web server installation complete."
echo "Site URL     : ${SITE_BASE_URL}"
echo "Backend URL  : ${BACKEND_BASE_URL}"
echo "Open browser : http://SERVER_PUBLIC_IP/"
