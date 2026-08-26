#!/usr/bin/env bash

set -euo pipefail

SOURCE_DB_HOST="${SOURCE_DB_HOST:?SOURCE_DB_HOST is required}"
SOURCE_DB_PORT="${SOURCE_DB_PORT:-3306}"
SOURCE_DB_USER="${SOURCE_DB_USER:?SOURCE_DB_USER is required}"
SOURCE_DB_PASSWORD="${SOURCE_DB_PASSWORD:?SOURCE_DB_PASSWORD is required}"
TARGET_DB_HOST="${TARGET_DB_HOST:?TARGET_DB_HOST is required}"
TARGET_DB_PORT="${TARGET_DB_PORT:-3306}"
TARGET_DB_USER="${TARGET_DB_USER:?TARGET_DB_USER is required}"
TARGET_DB_PASSWORD="${TARGET_DB_PASSWORD:?TARGET_DB_PASSWORD is required}"
DB_NAME="${DB_NAME:-chapter3_board}"

source_count="$(MYSQL_PWD="${SOURCE_DB_PASSWORD}" mysql -N -B -h "${SOURCE_DB_HOST}" -P "${SOURCE_DB_PORT}" -u "${SOURCE_DB_USER}" "${DB_NAME}" -e "SELECT COUNT(*) FROM posts;")"
target_count="$(MYSQL_PWD="${TARGET_DB_PASSWORD}" mysql -N -B -h "${TARGET_DB_HOST}" -P "${TARGET_DB_PORT}" -u "${TARGET_DB_USER}" "${DB_NAME}" -e "SELECT COUNT(*) FROM posts;")"

echo "Source posts: ${source_count}"
echo "Target posts: ${target_count}"

if [[ "${source_count}" == "${target_count}" ]]; then
  echo "OK: post counts match."
else
  echo "WARN: post counts differ."
  exit 2
fi
