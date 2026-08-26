#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./prepare-source-db.sh"
  exit 1
fi

SOURCE_DB_ROOT_PASSWORD="${SOURCE_DB_ROOT_PASSWORD:-}"
MIGRATION_USER="${MIGRATION_USER:-dms_migration}"
MIGRATION_PASSWORD="${MIGRATION_PASSWORD:-ChangeMigrationPassword123!}"
SOURCE_DATABASE="${SOURCE_DATABASE:-chapter3_board}"
ALLOWED_HOST="${ALLOWED_HOST:-%}"

if [[ -z "${SOURCE_DB_ROOT_PASSWORD}" ]]; then
  echo "SOURCE_DB_ROOT_PASSWORD is required."
  exit 1
fi

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

mysql -u root -p"${SOURCE_DB_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${MIGRATION_USER}'@'${ALLOWED_HOST}' IDENTIFIED BY '${MIGRATION_PASSWORD}';
GRANT RELOAD, PROCESS, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${MIGRATION_USER}'@'${ALLOWED_HOST}';
GRANT SELECT ON mysql.* TO '${MIGRATION_USER}'@'${ALLOWED_HOST}';
GRANT SELECT, SHOW VIEW, LOCK TABLES, TRIGGER ON \`${SOURCE_DATABASE}\`.* TO '${MIGRATION_USER}'@'${ALLOWED_HOST}';
FLUSH PRIVILEGES;
SQL

echo "Source DB prepared for DMS."
echo "Config file : ${CONF_FILE}"
echo "DB service  : ${SERVICE_NAME}"
echo "User        : ${MIGRATION_USER}@${ALLOWED_HOST}"
echo "Database    : ${SOURCE_DATABASE}"
