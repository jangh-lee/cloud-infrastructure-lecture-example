#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git}"
SOURCE_DIR="${SOURCE_DIR:-/opt/cloud-infrastructure-lecture-example}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-chapter3_board}"
DB_USER="${DB_USER:-chapter3_user}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-*}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo -E ./prepare-backend-image.sh"
  exit 1
fi

for variable in DB_HOST DB_PASSWORD; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing required environment variable: ${variable}"
    exit 1
  fi
done

write_env_value() {
  local key="$1"
  local value="$2"

  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "${key}" "${value}"
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git curl ca-certificates

if [[ -d "${SOURCE_DIR}/.git" ]]; then
  git -C "${SOURCE_DIR}" fetch origin main
  git -C "${SOURCE_DIR}" checkout main
  git -C "${SOURCE_DIR}" pull --ff-only origin main
else
  git clone --branch main --single-branch "${REPO_URL}" "${SOURCE_DIR}"
fi

BACKEND_DIR="${SOURCE_DIR}/007-three tier web app/backend"

{
  write_env_value PORT "4000"
  write_env_value FRONTEND_ORIGIN "${FRONTEND_ORIGIN}"
  write_env_value DB_HOST "${DB_HOST}"
  write_env_value DB_PORT "${DB_PORT}"
  write_env_value DB_NAME "${DB_NAME}"
  write_env_value DB_USER "${DB_USER}"
  write_env_value DB_PASSWORD "${DB_PASSWORD}"
  write_env_value AUTO_POST_ENABLED "false"
  write_env_value AUTO_POST_INTERVAL_SECONDS "60"
  write_env_value AUTO_POST_TOTAL "300"
  write_env_value AUTO_POST_API_URL "http://127.0.0.1:4000/api/posts"
  write_env_value LAB_STRESS_ENABLED "true"
} > "${BACKEND_DIR}/.env"

chmod +x "${BACKEND_DIR}/install-backend.sh"
"${BACKEND_DIR}/install-backend.sh" install

systemctl disable --now chapter3-post-seeder.service >/dev/null 2>&1 || true
systemctl is-enabled chapter3-backend.service
systemctl is-active chapter3-backend.service

curl --fail --silent --show-error http://127.0.0.1:4000/api/health
echo
curl --fail --silent --show-error http://127.0.0.1:4000/api/instance
echo
curl --fail --silent --show-error "http://127.0.0.1:4000/api/stress?iterations=10000"

echo
echo "Backend image source is ready."
echo "Next: create a Server Image from this server in the Naver Cloud console."
