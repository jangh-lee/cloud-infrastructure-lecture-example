#!/usr/bin/env bash
set -euo pipefail

SERVER_NAME="${SERVER_NAME:-NCP-Lab}"
SERVER_PORT="${SERVER_PORT:-2759}"
MAX_PLAYERS="${MAX_PLAYERS:-24}"

exec supertuxkart \
  --no-graphics \
  --no-sound \
  "--lan-server=${SERVER_NAME}" \
  "--port=${SERVER_PORT}" \
  "--max-players=${MAX_PLAYERS}"
