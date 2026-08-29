#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./upgrade-mysql-source-to-84.sh" >&2
  exit 1
fi

if [[ "${CONFIRM_UPGRADE:-}" != "YES" ]]; then
  echo "This upgrades the Source DB packages from MySQL 8.0 to MySQL 8.4 LTS." >&2
  echo "Rerun with CONFIRM_UPGRADE=YES after verifying a server snapshot or backup." >&2
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

MYSQL_APT_CONFIG_VERSION="${MYSQL_APT_CONFIG_VERSION:-0.8.40-1}"
MYSQL_APT_CONFIG_MD5="${MYSQL_APT_CONFIG_MD5:-981ff0a16aab27a0cd97f4c4ee49e9fd}"
MYSQL_APT_CONFIG_DEB="/root/mysql-apt-config_${MYSQL_APT_CONFIG_VERSION}_all.deb"
MYSQL_APT_CONFIG_URL="https://repo.mysql.com/mysql-apt-config_${MYSQL_APT_CONFIG_VERSION}_all.deb"

current_version="$(MYSQL_PWD="${DB_ROOT_PASSWORD}" mysql -u root --batch --skip-column-names -e "SELECT VERSION();")"
if [[ "${current_version}" == 8.4.* ]]; then
  echo "Source DB is already MySQL ${current_version}."
  exit 0
fi
if [[ "${current_version}" != 8.0.* ]]; then
  echo "Expected MySQL 8.0 before upgrade, found ${current_version}." >&2
  exit 2
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="/root/mysql80-to-mysql84-${timestamp}"
mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"

MYSQL_PWD="${DB_ROOT_PASSWORD}" mysqldump \
  -u root \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  --databases "${DB_NAME}" > "${backup_dir}/${DB_NAME}.sql"
cp -a /etc/mysql "${backup_dir}/etc-mysql"
chmod 600 "${backup_dir}/${DB_NAME}.sql"

source_rows="$(MYSQL_PWD="${DB_ROOT_PASSWORD}" mysql -u root --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM \`${DB_NAME}\`.posts;")"

curl -fsSL "${MYSQL_APT_CONFIG_URL}" -o "${MYSQL_APT_CONFIG_DEB}"
echo "${MYSQL_APT_CONFIG_MD5}  ${MYSQL_APT_CONFIG_DEB}" | md5sum -c -

DEBIAN_FRONTEND=noninteractive \
MYSQL_SERVER_VERSION=mysql-8.4-lts \
MYSQL_CONNECTORS=Disabled \
  dpkg -i "${MYSQL_APT_CONFIG_DEB}"
DEBIAN_FRONTEND=noninteractive apt-get update

candidate_version="$(apt-cache policy mysql-server | awk '/Candidate:/ {print $2}')"
if [[ "${candidate_version}" != 8.4.* ]]; then
  echo "MySQL 8.4 candidate was not selected: ${candidate_version}" >&2
  exit 2
fi

mkdir -p /etc/mysql/conf.d /etc/mysql/mysql.conf.d
if [[ ! -f /etc/mysql/my.cnf.fallback ]]; then
  printf '!includedir /etc/mysql/conf.d/\n' > /etc/mysql/my.cnf.fallback
fi
if [[ ! -f /etc/mysql/conf.d/mysql.cnf ]]; then
  printf '[mysql]\n' > /etc/mysql/conf.d/mysql.cnf
fi

dms_config="/etc/mysql/mysql.conf.d/zz-dms-source.cnf"
if [[ ! -f "${dms_config}" ]]; then
  printf '[mysqld]\n' > "${dms_config}"
fi
if ! grep -Eq '^(loose-)?mysql[-_]native[-_]password[[:space:]]*=' "${dms_config}"; then
  printf '\n# MySQL 8.4 disables this DMS-compatible plugin by default.\nloose-mysql-native-password=ON\n' >> "${dms_config}"
fi

export DEBIAN_FRONTEND=noninteractive
if ! apt-get install -y -o Dpkg::Options::="--force-confold" mysql-server; then
  dpkg --configure -a
  apt-get -f install -y
fi

systemctl restart mysql
systemctl is-active --quiet mysql

upgraded_version="$(MYSQL_PWD="${DB_ROOT_PASSWORD}" mysql -u root --batch --skip-column-names -e "SELECT VERSION();")"
target_rows="$(MYSQL_PWD="${DB_ROOT_PASSWORD}" mysql -u root --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM \`${DB_NAME}\`.posts;")"

if [[ "${upgraded_version}" != 8.4.* ]]; then
  echo "Upgrade verification failed: expected 8.4, found ${upgraded_version}." >&2
  exit 2
fi
if [[ "${source_rows}" != "${target_rows}" ]]; then
  echo "Row-count verification failed: before=${source_rows}, after=${target_rows}" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DB_ADMIN_PASSWORD="${DB_ROOT_PASSWORD}" SOURCE_DATABASE="${DB_NAME}" \
  "${script_dir}/check-source-db.sh"

echo "MySQL 8.4 Source upgrade completed."
echo "Backup directory: ${backup_dir}"
echo "DB version      : ${upgraded_version}"
echo "Verified rows   : ${target_rows}"
