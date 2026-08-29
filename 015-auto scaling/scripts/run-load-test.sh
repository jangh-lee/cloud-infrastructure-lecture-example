#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-${LB_URL:-}}"
DURATION_SECONDS="${DURATION_SECONDS:-600}"
CONCURRENCY="${CONCURRENCY:-20}"
ITERATIONS="${ITERATIONS:-250000}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: DURATION_SECONDS=600 CONCURRENCY=20 ITERATIONS=250000 $0 http://LOAD_BALANCER_DOMAIN"
  exit 1
fi

for variable in DURATION_SECONDS CONCURRENCY ITERATIONS; do
  if ! [[ "${!variable}" =~ ^[1-9][0-9]*$ ]]; then
    echo "${variable} must be a positive integer."
    exit 1
  fi
done

if (( CONCURRENCY > 200 )); then
  echo "CONCURRENCY must be 200 or less for this lab."
  exit 1
fi

BASE_URL="${BASE_URL%/}"
STRESS_URL="${BASE_URL}/api/stress?iterations=${ITERATIONS}"
RESULT_DIR="$(mktemp -d)"
CHILD_PIDS=()

cleanup() {
  if (( ${#CHILD_PIDS[@]} > 0 )); then
    kill "${CHILD_PIDS[@]}" >/dev/null 2>&1 || true
  fi
  rm -rf "${RESULT_DIR}"
}
trap cleanup EXIT INT TERM

if ! curl --fail --silent --show-error --max-time 30 "${BASE_URL}/api/stress?iterations=10000" | grep -qx 'ok'; then
  echo "The stress endpoint is unavailable. Check LAB_STRESS_ENABLED and the load balancer target health."
  exit 1
fi

run_worker() {
  local worker_id="$1"
  local deadline="$2"
  local success_count=0
  local failure_count=0

  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error --max-time 30 --output /dev/null "${STRESS_URL}"; then
      success_count=$((success_count + 1))
    else
      failure_count=$((failure_count + 1))
    fi
  done

  printf '%s %s\n' "${success_count}" "${failure_count}" > "${RESULT_DIR}/${worker_id}.count"
}

DEADLINE=$((SECONDS + DURATION_SECONDS))

echo "Starting the CPU load test."
echo "Target      : ${BASE_URL}"
echo "Duration    : ${DURATION_SECONDS} seconds"
echo "Concurrency : ${CONCURRENCY}"
echo "Iterations  : ${ITERATIONS} per request"
echo "Stop        : Ctrl+C"

for worker_id in $(seq 1 "${CONCURRENCY}"); do
  run_worker "${worker_id}" "${DEADLINE}" &
  CHILD_PIDS+=("$!")
done

for child_pid in "${CHILD_PIDS[@]}"; do
  wait "${child_pid}"
done
CHILD_PIDS=()

read -r SUCCESS_TOTAL FAILURE_TOTAL < <(
  awk '{success += $1; failure += $2} END {print success + 0, failure + 0}' "${RESULT_DIR}"/*.count
)

echo "Load test complete."
echo "Successful requests: ${SUCCESS_TOTAL}"
echo "Failed requests    : ${FAILURE_TOTAL}"
