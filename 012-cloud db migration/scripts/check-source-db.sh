#!/usr/bin/env bash

set -euo pipefail

SOURCE_DB_ADMIN_USER="${SOURCE_DB_ADMIN_USER:-root}"
SOURCE_DB_ADMIN_PASSWORD="${SOURCE_DB_ADMIN_PASSWORD:-${SOURCE_DB_ROOT_PASSWORD:-}}"
SOURCE_DB_ADMIN_HOST="${SOURCE_DB_ADMIN_HOST:-}"
SOURCE_DB_ADMIN_PORT="${SOURCE_DB_ADMIN_PORT:-3306}"

MYSQL_BIN="$(command -v mariadb || command -v mysql || true)"

if [[ -z "${MYSQL_BIN}" ]]; then
  echo "mariadb or mysql client is required." >&2
  exit 1
fi

run_check_sql() {
  if [[ -n "${SOURCE_DB_ADMIN_HOST}" ]]; then
    if [[ -z "${SOURCE_DB_ADMIN_PASSWORD}" ]]; then
      echo "SOURCE_DB_ADMIN_PASSWORD is required when SOURCE_DB_ADMIN_HOST is set." >&2
      exit 1
    fi

    MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" \
      -h "${SOURCE_DB_ADMIN_HOST}" \
      -P "${SOURCE_DB_ADMIN_PORT}" \
      -u "${SOURCE_DB_ADMIN_USER}" <<'SQL'
SHOW VARIABLES WHERE Variable_name IN ('server_id', 'log_bin', 'binlog_format', 'expire_logs_days', 'bind_address');
SHOW MASTER STATUS;
SQL
    return
  fi

  if [[ -n "${SOURCE_DB_ADMIN_PASSWORD}" ]] && MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" -e "SELECT 1;" >/dev/null 2>&1; then
    MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" <<'SQL'
SHOW VARIABLES WHERE Variable_name IN ('server_id', 'log_bin', 'binlog_format', 'expire_logs_days', 'bind_address');
SHOW MASTER STATUS;
SQL
    return
  fi

  "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" <<'SQL'
SHOW VARIABLES WHERE Variable_name IN ('server_id', 'log_bin', 'binlog_format', 'expire_logs_days', 'bind_address');
SHOW MASTER STATUS;
SQL
}

run_check_sql
