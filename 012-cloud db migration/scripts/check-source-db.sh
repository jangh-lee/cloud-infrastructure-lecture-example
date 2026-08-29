#!/usr/bin/env bash

set -euo pipefail

SOURCE_DB_ADMIN_USER="${SOURCE_DB_ADMIN_USER:-root}"
SOURCE_DB_ADMIN_PASSWORD="${SOURCE_DB_ADMIN_PASSWORD:-${SOURCE_DB_ROOT_PASSWORD:-}}"
SOURCE_DB_ADMIN_HOST="${SOURCE_DB_ADMIN_HOST:-}"
SOURCE_DB_ADMIN_PORT="${SOURCE_DB_ADMIN_PORT:-3306}"
MIGRATION_USER="${MIGRATION_USER:-dms_migration}"
SOURCE_DATABASE="${SOURCE_DATABASE:-chapter3_board}"

MYSQL_BIN="$(command -v mariadb || command -v mysql || true)"

if [[ -z "${MYSQL_BIN}" ]]; then
  echo "mariadb or mysql client is required." >&2
  exit 1
fi

ADMIN_ARGS=(-u "${SOURCE_DB_ADMIN_USER}" --batch --skip-column-names)
if [[ -n "${SOURCE_DB_ADMIN_HOST}" ]]; then
  ADMIN_ARGS+=(-h "${SOURCE_DB_ADMIN_HOST}" -P "${SOURCE_DB_ADMIN_PORT}")
fi

query() {
  local sql="$1"
  if [[ -n "${SOURCE_DB_ADMIN_PASSWORD}" ]]; then
    MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" "${ADMIN_ARGS[@]}" -e "${sql}"
  else
    "${MYSQL_BIN}" "${ADMIN_ARGS[@]}" -e "${sql}"
  fi
}

failures=0

check_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "${actual}" == "${expected}" ]]; then
    printf 'OK   %-24s %s\n' "${label}" "${actual}"
  else
    printf 'FAIL %-24s expected=%s actual=%s\n' "${label}" "${expected}" "${actual:-<empty>}"
    failures=$((failures + 1))
  fi
}

if ! query "SELECT 1;" >/dev/null 2>&1; then
  echo "FAIL admin connection: ${SOURCE_DB_ADMIN_USER}@${SOURCE_DB_ADMIN_HOST:-localhost}:${SOURCE_DB_ADMIN_PORT}" >&2
  exit 2
fi

db_version="$(query "SELECT VERSION();")"
server_id="$(query "SELECT @@server_id;")"
log_bin="$(query "SELECT @@log_bin;")"
binlog_format="$(query "SELECT @@binlog_format;")"
binlog_row_image="$(query "SELECT @@binlog_row_image;" 2>/dev/null || echo UNKNOWN)"
bind_address="$(query "SELECT @@bind_address;" 2>/dev/null || echo UNKNOWN)"
binary_log_status="$(query "SHOW BINARY LOG STATUS;" 2>/dev/null || query "SHOW MASTER STATUS;" 2>/dev/null || true)"
database_exists="$(query "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${SOURCE_DATABASE}';")"
posts_exists="$(query "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SOURCE_DATABASE}' AND TABLE_NAME='posts';")"
posts_count="0"
if [[ "${posts_exists}" == "1" ]]; then
  posts_count="$(query "SELECT COUNT(*) FROM \`${SOURCE_DATABASE}\`.posts;")"
fi

account_row="$(query "SELECT User, Host, plugin FROM mysql.user WHERE User='${MIGRATION_USER}' ORDER BY Host LIMIT 1;" 2>/dev/null || true)"
account_user=""
account_host=""
auth_plugin=""
read -r account_user account_host auth_plugin <<< "${account_row}"
account_name=""
if [[ -n "${account_user}" && -n "${account_host}" ]]; then
  account_name="${account_user}@${account_host}"
fi

global_privileges="$(query "SELECT COUNT(DISTINCT CASE WHEN PRIVILEGE_TYPE='BINLOG MONITOR' THEN 'REPLICATION CLIENT' ELSE PRIVILEGE_TYPE END) FROM information_schema.USER_PRIVILEGES WHERE GRANTEE LIKE '\\'${MIGRATION_USER}\\'@%' AND PRIVILEGE_TYPE IN ('RELOAD','PROCESS','SHOW DATABASES','REPLICATION SLAVE','REPLICATION CLIENT','BINLOG MONITOR');")"
schema_privileges="$(query "SELECT COUNT(DISTINCT PRIVILEGE_TYPE) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE LIKE '\\'${MIGRATION_USER}\\'@%' AND TABLE_SCHEMA='${SOURCE_DATABASE}' AND PRIVILEGE_TYPE IN ('SELECT','SHOW VIEW','LOCK TABLES','TRIGGER');")"
mysql_select="$(query "SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE LIKE '\\'${MIGRATION_USER}\\'@%' AND TABLE_SCHEMA='mysql' AND PRIVILEGE_TYPE='SELECT';")"

echo "Source DB preflight"
echo "-------------------"
printf 'INFO %-24s %s\n' "DB version" "${db_version}"
if [[ "${bind_address}" == "127.0.0.1" || "${bind_address}" == "::1" || "${bind_address}" == "localhost" ]]; then
  printf 'FAIL %-24s loopback-only value %s\n' "bind_address" "${bind_address}"
  failures=$((failures + 1))
else
  printf 'OK   %-24s %s\n' "bind_address" "${bind_address}"
fi
check_equal "log_bin" "${log_bin}" "1"
if [[ "${server_id}" != "0" ]]; then
  printf 'OK   %-24s %s\n' "server_id" "${server_id}"
else
  printf 'FAIL %-24s must not be 0\n' "server_id"
  failures=$((failures + 1))
fi
check_equal "binlog_format" "${binlog_format}" "ROW"
if [[ "${binlog_row_image}" == "FULL" || "${binlog_row_image}" == "UNKNOWN" ]]; then
  printf 'OK   %-24s %s\n' "binlog_row_image" "${binlog_row_image}"
else
  printf 'FAIL %-24s expected=FULL actual=%s\n' "binlog_row_image" "${binlog_row_image}"
  failures=$((failures + 1))
fi
if [[ -n "${binary_log_status}" ]]; then
  printf 'OK   %-24s %s\n' "binary log position" "$(awk '{print $1 ":" $2}' <<< "${binary_log_status}")"
else
  printf 'FAIL %-24s binary log status returned no row\n' "binary log position"
  failures=$((failures + 1))
fi
check_equal "source database" "${database_exists}" "1"
check_equal "posts table" "${posts_exists}" "1"
printf 'INFO %-24s %s\n' "posts rows" "${posts_count}"

if [[ -n "${account_name}" ]]; then
  printf 'OK   %-24s %s\n' "DMS account" "${account_name}"
else
  printf 'FAIL %-24s user %s not found\n' "DMS account" "${MIGRATION_USER}"
  failures=$((failures + 1))
fi
check_equal "auth plugin" "${auth_plugin}" "mysql_native_password"
check_equal "global privileges" "${global_privileges}" "5"
check_equal "schema privileges" "${schema_privileges}" "4"
if (( mysql_select >= 1 )); then
  printf 'OK   %-24s granted\n' "SELECT on mysql.*"
else
  printf 'FAIL %-24s missing\n' "SELECT on mysql.*"
  failures=$((failures + 1))
fi

if (( failures > 0 )); then
  echo
  echo "Preflight failed with ${failures} problem(s)."
  exit 2
fi

echo
echo "Preflight passed. Next verify ACG/routing from the Target DB network to this Source DB on TCP ${SOURCE_DB_ADMIN_PORT}."
