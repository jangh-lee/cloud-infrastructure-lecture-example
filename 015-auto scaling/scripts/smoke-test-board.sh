#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-${LB_URL:-}}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: $0 http://LOAD_BALANCER_DOMAIN"
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TITLE="autoscaling-smoke-$(date +%Y%m%d-%H%M%S)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "${RESPONSE_FILE}"' EXIT

HTTP_STATUS="$(curl --silent --show-error \
  --output "${RESPONSE_FILE}" \
  --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --request POST \
  --data "{\"title\":\"${TITLE}\",\"content\":\"Auto Scaling load balancer and Cloud DB write test\",\"authorName\":\"autoscaling-lab\"}" \
  "${BASE_URL}/api/posts")"

if [[ "${HTTP_STATUS}" != "201" ]]; then
  echo "FAIL: POST /api/posts returned HTTP ${HTTP_STATUS}"
  cat "${RESPONSE_FILE}"
  exit 1
fi

grep -Fq "${TITLE}" "${RESPONSE_FILE}"
curl --fail --silent --show-error "${BASE_URL}/api/posts" | grep -Fq "${TITLE}"

echo "PASS: a post was created through the load balancer and read from Cloud DB."
echo "Created title: ${TITLE}"
