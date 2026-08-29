#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-${LB_URL:-}}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: $0 http://LOAD_BALANCER_DOMAIN"
  exit 1
fi

BASE_URL="${BASE_URL%/}"
HEADER_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
trap 'rm -f "${HEADER_FILE}" "${BODY_FILE}"' EXIT

curl --fail --silent --show-error \
  --dump-header "${HEADER_FILE}" \
  --output "${BODY_FILE}" \
  "${BASE_URL}/api/health"

grep -q '"status":"ok"' "${BODY_FILE}"
INSTANCE_NAME="$(awk -F': ' 'tolower($1) == "x-backend-instance" {gsub("\\r", "", $2); print $2; exit}' "${HEADER_FILE}")"

if [[ -z "${INSTANCE_NAME}" ]]; then
  echo "FAIL: X-Backend-Instance response header is missing."
  exit 1
fi

curl --fail --silent --show-error "${BASE_URL}/api/instance" | grep -q '"instance"'
curl --fail --silent --show-error "${BASE_URL}/api/posts" | grep -Eq '^\['
curl --fail --silent --show-error "${BASE_URL}/api/stress?iterations=10000" | grep -qx 'ok'

echo "PASS: health, instance, posts, and stress endpoints"
echo "Serving backend instance: ${INSTANCE_NAME}"
