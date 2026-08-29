#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./convert-mariadb-source-to-mysql.sh" >&2
  exit 1
fi

if [[ "${CONFIRM_CONVERSION:-}" != "YES" ]]; then
  echo "This replaces MariaDB with MySQL while preserving the selected database." >&2
  echo "Rerun with CONFIRM_CONVERSION=YES after verifying a server snapshot or backup." >&2
  exit 1
fi

ENV_FILE="${ENV_FILE:-/root/cloud-infrastructure-lecture-example/007-three tier web app/db/.env}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "DB environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required in ENV_FILE}"
: "${DB_NAME:?DB_NAME is required in ENV_FILE}"
: "${DB_USER:?DB_USER is required in ENV_FILE}"
: "${DB_PASSWORD:?DB_PASSWORD is required in ENV_FILE}"

if ! command -v mariadb-dump >/dev/null 2>&1; then
  echo "mariadb-dump is required before conversion." >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="/root/mariadb-to-mysql-${timestamp}"
dump_file="${backup_dir}/${DB_NAME}.sql"
mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"

MYSQL_PWD="${DB_ROOT_PASSWORD}" mariadb-dump \
  -u root \
  --single-transaction \
  --routines \
  --triggers \
  --hex-blob \
  --default-character-set=utf8mb4 \
  --databases "${DB_NAME}" > "${dump_file}"

source_rows="$(MYSQL_PWD="${DB_ROOT_PASSWORD}" mariadb -u root --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM \`${DB_NAME}\`.posts;")"

systemctl stop mariadb
DEBIAN_FRONTEND=noninteractive apt-get purge -y \
  mariadb-server mariadb-server-core mariadb-client mariadb-client-core mariadb-common

if [[ -d /var/lib/mysql ]]; then
  mv /var/lib/mysql "${backup_dir}/mariadb-data"
fi
if [[ -d /etc/mysql ]]; then
  mv /etc/mysql "${backup_dir}/mariadb-config"
fi

DEBIAN_FRONTEND=noninteractive apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
systemctl enable --now mysql

# MariaDB adds a sandbox directive that Oracle MySQL does not understand.
if head -n 1 "${dump_file}" | grep -q '^/\*M!999999'; then
  tail -n +2 "${dump_file}" > "${dump_file}.mysql"
else
  cp "${dump_file}" "${dump_file}.mysql"
fi

mysql -u root < "${dump_file}.mysql"

db_user_sql="${DB_USER//\'/\'\'}"
db_password_sql="${DB_PASSWORD//\'/\'\'}"
db_allowed_host_sql="${DB_ALLOWED_HOST:-%}"
db_allowed_host_sql="${db_allowed_host_sql//\'/\'\'}"

mysql -u root <<SQL
CREATE USER IF NOT EXISTS '${db_user_sql}'@'${db_allowed_host_sql}' IDENTIFIED BY '${db_password_sql}';
ALTER USER '${db_user_sql}'@'${db_allowed_host_sql}' IDENTIFIED BY '${db_password_sql}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${db_user_sql}'@'${db_allowed_host_sql}';
FLUSH PRIVILEGES;
SQL

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DB_ADMIN_USER=root \
MIGRATION_PASSWORD="${MIGRATION_PASSWORD:-MigratePass123!}" \
ALLOWED_HOST="${ALLOWED_HOST:-%}" \
SOURCE_DATABASE="${DB_NAME}" \
  "${script_dir}/prepare-source-db.sh"

root_password_sql="${DB_ROOT_PASSWORD//\'/\'\'}"
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${root_password_sql}';"

target_rows="$(MYSQL_PWD="${DB_ROOT_PASSWORD}" mysql -u root --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM \`${DB_NAME}\`.posts;")"
if [[ "${source_rows}" != "${target_rows}" ]]; then
  echo "Row-count verification failed: before=${source_rows}, after=${target_rows}" >&2
  exit 2
fi

SOURCE_DB_ADMIN_PASSWORD="${DB_ROOT_PASSWORD}" SOURCE_DATABASE="${DB_NAME}" \
  "${script_dir}/check-source-db.sh"

echo "MariaDB to MySQL conversion completed."
echo "Backup directory: ${backup_dir}"
echo "Verified rows   : ${target_rows}"
