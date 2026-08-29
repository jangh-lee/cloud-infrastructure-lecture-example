#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-${LB_URL:-}}"
REQUEST_COUNT="${REQUEST_COUNT:-40}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: REQUEST_COUNT=40 $0 http://LOAD_BALANCER_DOMAIN"
  exit 1
fi

if ! [[ "${REQUEST_COUNT}" =~ ^[1-9][0-9]*$ ]]; then
  echo "REQUEST_COUNT must be a positive integer."
  exit 1
fi

BASE_URL="${BASE_URL%/}"
RESULT_FILE="$(mktemp)"
HEADER_FILE="$(mktemp)"
trap 'rm -f "${RESULT_FILE}" "${HEADER_FILE}"' EXIT

for _ in $(seq 1 "${REQUEST_COUNT}"); do
  : > "${HEADER_FILE}"
  if curl --fail --silent --show-error --max-time 10 \
    --dump-header "${HEADER_FILE}" \
    --output /dev/null \
    "${BASE_URL}/api/instance"; then
    awk -F': ' 'tolower($1) == "x-backend-instance" {gsub("\\r", "", $2); print $2; exit}' "${HEADER_FILE}" >> "${RESULT_FILE}"
  else
    echo "REQUEST_FAILED" >> "${RESULT_FILE}"
  fi
done

echo "Requests by backend instance (${REQUEST_COUNT} total attempts):"
sort "${RESULT_FILE}" | uniq -c | sort -nr

UNIQUE_INSTANCES="$(grep -v '^REQUEST_FAILED$' "${RESULT_FILE}" | sort -u | wc -l | tr -d ' ')"
echo "Unique healthy backend instances observed: ${UNIQUE_INSTANCES}"
