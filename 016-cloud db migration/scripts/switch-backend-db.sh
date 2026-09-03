#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./switch-backend-db.sh"
  exit 1
fi

BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-/opt/chapter3-backend/.env}"
DB_HOST="${DB_HOST:?DB_HOST is required}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:?DB_USER is required}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"
DB_NAME="${DB_NAME:-chapter3_board}"

if [[ ! -f "${BACKEND_ENV_FILE}" ]]; then
  echo "${BACKEND_ENV_FILE} does not exist."
  exit 1
fi

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "${BACKEND_ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${BACKEND_ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${BACKEND_ENV_FILE}"
  fi
}

set_env_value DB_HOST "${DB_HOST}"
set_env_value DB_PORT "${DB_PORT}"
set_env_value DB_USER "${DB_USER}"
set_env_value DB_PASSWORD "${DB_PASSWORD}"
set_env_value DB_NAME "${DB_NAME}"

systemctl restart chapter3-backend.service

if systemctl is-enabled chapter3-post-seeder.service >/dev/null 2>&1; then
  systemctl restart chapter3-post-seeder.service
fi

echo "Backend DB settings updated."
echo "DB_HOST=${DB_HOST}"
echo "DB_PORT=${DB_PORT}"
echo "DB_USER=${DB_USER}"
echo "DB_NAME=${DB_NAME}"
