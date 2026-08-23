#!/usr/bin/env bash

set -euo pipefail

cleanup() {
  if [[ -n "${TEMP_POLICY_RC_D:-}" && -f "${TEMP_POLICY_RC_D}" ]]; then
    rm -f "${TEMP_POLICY_RC_D}"
  fi
}

trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install.sh"
  exit 1
fi

DEFAULT_SERVER_NAME="demo-node"

if [[ -n "${1:-}" ]]; then
  SERVER_NAME="$1"
elif [[ -n "${userinput:-}" ]]; then
  SERVER_NAME="${userinput}"
elif [[ -n "${SERVER_NAME:-}" ]]; then
  SERVER_NAME="${SERVER_NAME}"
else
  SERVER_NAME="${DEFAULT_SERVER_NAME}"
fi

APP_DIR="/opt/lb-demo"
WEB_ROOT="/var/www/lb-demo"
NGINX_CONF="/etc/nginx/sites-available/lb-demo"
NGINX_LINK="/etc/nginx/sites-enabled/lb-demo"
SYSTEMD_SERVICE="/etc/systemd/system/lb-demo-status.service"
SYSTEMD_TIMER="/etc/systemd/system/lb-demo-status.timer"
TEMP_POLICY_RC_D=""

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

apt-get install -y nginx

mkdir -p "${APP_DIR}" "${WEB_ROOT}"

cp "$(dirname "$0")/update_status.sh" "${APP_DIR}/update_status.sh"
cp "$(dirname "$0")/templates/index.html.template" "${APP_DIR}/index.html.template"
chmod 755 "${APP_DIR}/update_status.sh"

sed "s|__SERVER_NAME__|${SERVER_NAME}|g" "${APP_DIR}/index.html.template" > "${WEB_ROOT}/index.html"
echo "ok" > "${WEB_ROOT}/healthz"

cat > "${NGINX_CONF}" <<'EOF'
server {
    listen 80 default_server;

    server_name _;
    root /var/www/lb-demo;
    index index.html;

    location = /healthz {
        default_type text/plain;
        try_files /healthz =404;
    }

    location = /status.json {
        default_type application/json;
        add_header Cache-Control "no-store";
        try_files /status.json =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf "${NGINX_CONF}" "${NGINX_LINK}"

cat > "${SYSTEMD_SERVICE}" <<'EOF'
[Unit]
Description=Refresh LB demo status JSON

[Service]
Type=oneshot
ExecStart=/opt/lb-demo/update_status.sh
EOF

cat > "${SYSTEMD_TIMER}" <<'EOF'
[Unit]
Description=Run LB demo status refresh every minute

[Timer]
OnBootSec=15s
OnUnitActiveSec=60s
Unit=lb-demo-status.service

[Install]
WantedBy=timers.target
EOF

nginx -t

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
  systemctl enable --now lb-demo-status.timer
  systemctl start lb-demo-status.service
  systemctl enable nginx
  systemctl restart nginx
else
  "${APP_DIR}/update_status.sh"
  service nginx restart
fi

echo
echo "Installation complete."
echo "Server name : ${SERVER_NAME}"
echo "Web root    : ${WEB_ROOT}"
echo "Health check: /healthz"
echo "Status JSON : /status.json"
