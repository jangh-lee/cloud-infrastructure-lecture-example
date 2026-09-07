#!/usr/bin/env bash
set -euo pipefail

SOURCE_DB_HOST="${SOURCE_DB_HOST:-}"
SOURCE_DB_PORT="${SOURCE_DB_PORT:-3306}"
SOURCE_DB_USER="${SOURCE_DB_USER:-}"
SOURCE_DB_PASSWORD="${SOURCE_DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-board_service}"
DUMP_FILE="${DUMP_FILE:-/tmp/${DB_NAME}.sql}"

if [[ -z "$SOURCE_DB_HOST" || -z "$SOURCE_DB_USER" || -z "$SOURCE_DB_PASSWORD" ]]; then
  echo "Required: SOURCE_DB_HOST, SOURCE_DB_USER, SOURCE_DB_PASSWORD" >&2
  exit 1
fi

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "mysqldump is not installed. Install mysql-client or mariadb-client first." >&2
  exit 1
fi

echo "Dumping database '$DB_NAME' from $SOURCE_DB_HOST:$SOURCE_DB_PORT to $DUMP_FILE"

MYSQL_PWD="$SOURCE_DB_PASSWORD" mysqldump \
  -h "$SOURCE_DB_HOST" \
  -P "$SOURCE_DB_PORT" \
  -u "$SOURCE_DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  --databases "$DB_NAME" \
  > "$DUMP_FILE"

ls -lh "$DUMP_FILE"
