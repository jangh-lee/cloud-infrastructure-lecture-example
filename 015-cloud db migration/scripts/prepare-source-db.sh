#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./prepare-source-db.sh" >&2
  exit 1
fi

SOURCE_DB_ADMIN_USER="${SOURCE_DB_ADMIN_USER:-root}"
SOURCE_DB_ADMIN_PASSWORD="${SOURCE_DB_ADMIN_PASSWORD:-${SOURCE_DB_ROOT_PASSWORD:-}}"
SOURCE_DB_ADMIN_HOST="${SOURCE_DB_ADMIN_HOST:-}"
SOURCE_DB_ADMIN_PORT="${SOURCE_DB_ADMIN_PORT:-3306}"
MIGRATION_USER="${MIGRATION_USER:-dms_migration}"
MIGRATION_PASSWORD="${MIGRATION_PASSWORD:-MigratePass123!}"
SOURCE_DATABASE="${SOURCE_DATABASE:-chapter3_board}"
ALLOWED_HOST="${ALLOWED_HOST:-%}"

MYSQL_BIN="$(command -v mariadb || command -v mysql || true)"

if [[ -z "${MYSQL_BIN}" ]]; then
  echo "mariadb or mysql client is required." >&2
  exit 1
fi

if [[ ! "${SOURCE_DB_ADMIN_PORT}" =~ ^[0-9]+$ ]] || (( SOURCE_DB_ADMIN_PORT < 1 || SOURCE_DB_ADMIN_PORT > 65535 )); then
  echo "SOURCE_DB_ADMIN_PORT must be a valid TCP port." >&2
  exit 1
fi

if [[ ! "${MIGRATION_USER}" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "MIGRATION_USER may contain only letters, numbers, and underscores." >&2
  exit 1
fi

if [[ ! "${SOURCE_DATABASE}" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "SOURCE_DATABASE may contain only letters, numbers, and underscores." >&2
  exit 1
fi

if [[ ! "${ALLOWED_HOST}" =~ ^[A-Za-z0-9_.:%/-]+$ ]]; then
  echo "ALLOWED_HOST contains unsupported characters." >&2
  exit 1
fi

if (( ${#MIGRATION_PASSWORD} < 2 || ${#MIGRATION_PASSWORD} > 21 )); then
  echo "MIGRATION_PASSWORD must be 2-21 characters for NCP Cloud DB compatibility." >&2
  exit 1
fi

escape_sql_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\'/\'\'}"
  printf '%s' "${value}"
}

ADMIN_ARGS=(-u "${SOURCE_DB_ADMIN_USER}")
if [[ -n "${SOURCE_DB_ADMIN_HOST}" ]]; then
  ADMIN_ARGS+=(-h "${SOURCE_DB_ADMIN_HOST}" -P "${SOURCE_DB_ADMIN_PORT}")
fi

run_admin_sql() {
  local sql="$1"
  shift

  if [[ -n "${SOURCE_DB_ADMIN_PASSWORD}" ]]; then
    MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" "${ADMIN_ARGS[@]}" "$@" -e "${sql}"
  else
    "${MYSQL_BIN}" "${ADMIN_ARGS[@]}" "$@" -e "${sql}"
  fi
}

if ! run_admin_sql "SELECT 1;" >/dev/null 2>&1; then
  echo "Could not connect as MySQL admin user '${SOURCE_DB_ADMIN_USER}'." >&2
  echo "For the 007 Ubuntu DB server, run with sudo and set SOURCE_DB_ADMIN_PASSWORD only if root requires it." >&2
  exit 1
fi

database_exists="$(run_admin_sql "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${SOURCE_DATABASE}';" --skip-column-names)"
if [[ "${database_exists}" != "1" ]]; then
  echo "Source database '${SOURCE_DATABASE}' does not exist." >&2
  exit 1
fi

DB_VERSION="$(run_admin_sql "SELECT VERSION();" --skip-column-names)"
if [[ "${DB_VERSION}" == *MariaDB* ]]; then
  CONF_DIR="/etc/mysql/mariadb.conf.d"
  CONF_BASENAME="60-dms-source.cnf"
  SERVICE_NAME="mariadb"
  AUTH_SQL="IDENTIFIED VIA mysql_native_password USING PASSWORD('$(escape_sql_string "${MIGRATION_PASSWORD}")')"
  EXPIRY_SETTING="expire_logs_days=5"
  NATIVE_PASSWORD_SETTING=""
elif systemctl list-unit-files mysql.service >/dev/null 2>&1; then
  CONF_DIR="/etc/mysql/mysql.conf.d"
  # Ubuntu's mysqld.cnf sorts after numeric names and would override bind-address.
  CONF_BASENAME="zz-dms-source.cnf"
  SERVICE_NAME="mysql"
  AUTH_SQL="IDENTIFIED WITH mysql_native_password BY '$(escape_sql_string "${MIGRATION_PASSWORD}")'"
  EXPIRY_SETTING="binlog_expire_logs_seconds=432000"
  NATIVE_PASSWORD_SETTING=""
  if [[ "${DB_VERSION}" == 8.4.* ]]; then
    NATIVE_PASSWORD_SETTING="mysql_native_password=ON"
  fi
else
  echo "Unsupported local database service. Expected MariaDB or MySQL managed by systemd." >&2
  exit 1
fi

if [[ -n "${SOURCE_DB_ADMIN_HOST}" ]]; then
  echo "Remote admin mode cannot update the Source DB server configuration." >&2
  echo "Run this script on the Source DB server without SOURCE_DB_ADMIN_HOST." >&2
  exit 1
fi

CONF_FILE="${CONF_DIR}/${CONF_BASENAME}"
CONF_BACKUP="${CONF_FILE}.pre-dms"
HAD_EXISTING_CONFIG=false

if [[ -f "${CONF_FILE}" ]]; then
  cp -a "${CONF_FILE}" "${CONF_BACKUP}"
  HAD_EXISTING_CONFIG=true
fi

rollback_config() {
  if [[ "${HAD_EXISTING_CONFIG}" == "true" ]]; then
    cp -a "${CONF_BACKUP}" "${CONF_FILE}"
  else
    rm -f "${CONF_FILE}"
  fi
  systemctl restart "${SERVICE_NAME}" >/dev/null 2>&1 || true
}

cat > "${CONF_FILE}" <<EOF
[mysqld]
server-id=1
log_bin=mysql-bin
binlog_format=ROW
binlog_row_image=FULL
${EXPIRY_SETTING}
${NATIVE_PASSWORD_SETTING}
bind-address=0.0.0.0
EOF

if ! systemctl restart "${SERVICE_NAME}"; then
  echo "DB restart failed after writing ${CONF_FILE}; restoring the previous configuration." >&2
  rollback_config
  exit 1
fi

migration_user_sql="$(escape_sql_string "${MIGRATION_USER}")"
allowed_host_sql="$(escape_sql_string "${ALLOWED_HOST}")"

if ! run_admin_sql "
CREATE USER IF NOT EXISTS '${migration_user_sql}'@'${allowed_host_sql}' ${AUTH_SQL};
ALTER USER '${migration_user_sql}'@'${allowed_host_sql}' ${AUTH_SQL};
GRANT RELOAD, PROCESS, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${migration_user_sql}'@'${allowed_host_sql}';
GRANT SELECT ON mysql.* TO '${migration_user_sql}'@'${allowed_host_sql}';
GRANT SELECT, SHOW VIEW, LOCK TABLES, TRIGGER ON \`${SOURCE_DATABASE}\`.* TO '${migration_user_sql}'@'${allowed_host_sql}';
FLUSH PRIVILEGES;
"; then
  echo "Creating the migration account failed. DB configuration remains enabled for diagnosis." >&2
  exit 1
fi

rm -f "${CONF_BACKUP}"

echo "Source DB prepared for Naver Cloud DMS."
echo "DB version   : ${DB_VERSION}"
echo "Config file  : ${CONF_FILE}"
echo "DB service   : ${SERVICE_NAME}"
echo "Admin user   : ${SOURCE_DB_ADMIN_USER}"
echo "DMS account  : ${MIGRATION_USER}@${ALLOWED_HOST}"
echo "Auth plugin  : mysql_native_password"
echo "Database     : ${SOURCE_DATABASE}"
if [[ "${ALLOWED_HOST}" == "%" ]]; then
  echo "WARN: ALLOWED_HOST=% is convenient for a lab but should be narrowed to the Target DB subnet or IP."
fi
