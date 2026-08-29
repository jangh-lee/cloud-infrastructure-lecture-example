#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./prepare-source-db.sh"
  exit 1
fi

SOURCE_DB_ADMIN_USER="${SOURCE_DB_ADMIN_USER:-root}"
SOURCE_DB_ADMIN_PASSWORD="${SOURCE_DB_ADMIN_PASSWORD:-${SOURCE_DB_ROOT_PASSWORD:-}}"
SOURCE_DB_ADMIN_HOST="${SOURCE_DB_ADMIN_HOST:-}"
SOURCE_DB_ADMIN_PORT="${SOURCE_DB_ADMIN_PORT:-3306}"
MIGRATION_USER="${MIGRATION_USER:-dms_migration}"
MIGRATION_PASSWORD="${MIGRATION_PASSWORD:-ChangeMigrationPassword123!}"
SOURCE_DATABASE="${SOURCE_DATABASE:-chapter3_board}"
ALLOWED_HOST="${ALLOWED_HOST:-%}"

MYSQL_BIN="$(command -v mariadb || command -v mysql || true)"

if [[ -z "${MYSQL_BIN}" ]]; then
  echo "mariadb or mysql client is required." >&2
  exit 1
fi

run_admin_sql() {
  local sql="$1"

  if [[ -n "${SOURCE_DB_ADMIN_HOST}" ]]; then
    if [[ -z "${SOURCE_DB_ADMIN_PASSWORD}" ]]; then
      echo "SOURCE_DB_ADMIN_PASSWORD is required when SOURCE_DB_ADMIN_HOST is set." >&2
      exit 1
    fi

    MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" \
      -h "${SOURCE_DB_ADMIN_HOST}" \
      -P "${SOURCE_DB_ADMIN_PORT}" \
      -u "${SOURCE_DB_ADMIN_USER}" <<SQL
${sql}
SQL
    return
  fi

  if [[ -n "${SOURCE_DB_ADMIN_PASSWORD}" ]]; then
    if MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" -e "SELECT 1;" >/dev/null 2>&1; then
      MYSQL_PWD="${SOURCE_DB_ADMIN_PASSWORD}" "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" <<SQL
${sql}
SQL
      return
    fi
  fi

  if "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" -e "SELECT 1;" >/dev/null 2>&1; then
    "${MYSQL_BIN}" -u "${SOURCE_DB_ADMIN_USER}" <<SQL
${sql}
SQL
    return
  fi

  echo "Could not connect as MySQL admin user '${SOURCE_DB_ADMIN_USER}'." >&2
  echo "For the 007 Ubuntu DB server, run this script with sudo and omit SOURCE_DB_ROOT_PASSWORD if root uses unix_socket authentication." >&2
  echo "For Naver Cloud DB for MySQL, create DB users from Console > Cloud DB for MySQL > Manage DB > Manage DB user." >&2
  exit 1
}

if [[ -d /etc/mysql/mariadb.conf.d ]]; then
  CONF_FILE="/etc/mysql/mariadb.conf.d/60-dms-source.cnf"
  SERVICE_NAME="mariadb"
else
  CONF_FILE="/etc/mysql/mysql.conf.d/60-dms-source.cnf"
  SERVICE_NAME="mysql"
fi

cat > "${CONF_FILE}" <<'EOF'
[mysqld]
server-id=1
log_bin=mysql-bin
binlog_format=ROW
expire_logs_days=5
bind-address=0.0.0.0
EOF

systemctl restart "${SERVICE_NAME}"

run_admin_sql "
CREATE USER IF NOT EXISTS '${MIGRATION_USER}'@'${ALLOWED_HOST}' IDENTIFIED BY '${MIGRATION_PASSWORD}';
GRANT RELOAD, PROCESS, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${MIGRATION_USER}'@'${ALLOWED_HOST}';
GRANT SELECT ON mysql.* TO '${MIGRATION_USER}'@'${ALLOWED_HOST}';
GRANT SELECT, SHOW VIEW, LOCK TABLES, TRIGGER ON \`${SOURCE_DATABASE}\`.* TO '${MIGRATION_USER}'@'${ALLOWED_HOST}';
FLUSH PRIVILEGES;
"

echo "Source DB prepared for DMS."
echo "Config file : ${CONF_FILE}"
echo "DB service  : ${SERVICE_NAME}"
echo "Admin User  : ${SOURCE_DB_ADMIN_USER}"
echo "User        : ${MIGRATION_USER}@${ALLOWED_HOST}"
echo "Database    : ${SOURCE_DATABASE}"
