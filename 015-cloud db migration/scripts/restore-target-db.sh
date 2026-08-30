#!/usr/bin/env bash
set -euo pipefail

TARGET_DB_HOST="${TARGET_DB_HOST:-}"
TARGET_DB_PORT="${TARGET_DB_PORT:-3306}"
TARGET_DB_USER="${TARGET_DB_USER:-}"
TARGET_DB_PASSWORD="${TARGET_DB_PASSWORD:-}"
DUMP_FILE="${DUMP_FILE:-}"

if [[ -z "$TARGET_DB_HOST" || -z "$TARGET_DB_USER" || -z "$TARGET_DB_PASSWORD" || -z "$DUMP_FILE" ]]; then
  echo "Required: TARGET_DB_HOST, TARGET_DB_USER, TARGET_DB_PASSWORD, DUMP_FILE" >&2
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo "mysql client is not installed. Install mysql-client or mariadb-client first." >&2
  exit 1
fi

echo "Restoring $DUMP_FILE to $TARGET_DB_HOST:$TARGET_DB_PORT"

MYSQL_PWD="$TARGET_DB_PASSWORD" mysql \
  -h "$TARGET_DB_HOST" \
  -P "$TARGET_DB_PORT" \
  -u "$TARGET_DB_USER" \
  < "$DUMP_FILE"

echo "Restore completed."
