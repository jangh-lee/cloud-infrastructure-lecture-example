#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo bash install-db.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARIADB_CONF="/etc/mysql/mariadb.conf.d/50-server.cnf"

run_mariadb_root() {
  local sql="$1"

  if mariadb -u root -e "SELECT 1;" >/dev/null 2>&1; then
    mariadb -u root <<EOF
${sql}
EOF
    return
  fi

  if mariadb -u root -p"${DB_ROOT_PASSWORD}" -e "SELECT 1;" >/dev/null 2>&1; then
    mariadb -u root -p"${DB_ROOT_PASSWORD}" <<EOF
${sql}
EOF
    return
  fi

  if [[ -n "${DB_PREVIOUS_ROOT_PASSWORD:-}" ]] && \
    mariadb -u root -p"${DB_PREVIOUS_ROOT_PASSWORD}" -e "SELECT 1;" >/dev/null 2>&1; then
    mariadb -u root -p"${DB_PREVIOUS_ROOT_PASSWORD}" <<EOF
${sql}
EOF
    return
  fi

  echo "Unable to authenticate as MariaDB root."
  echo "If DB_ROOT_PASSWORD changed, set DB_PREVIOUS_ROOT_PASSWORD to the current password and rerun."
  exit 1
}

escape_sql_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\'/\'\'}"
  printf '%s' "${value}"
}

escape_sql_identifier() {
  local value="$1"
  value="${value//\`/\`\`}"
  printf '%s' "${value}"
}

require_env_value() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    echo "${name} must be set in ${SCRIPT_DIR}/.env"
    exit 1
  fi
}

ensure_env_file() {
  if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    return
  fi

  if [[ -n "${DB_ROOT_PASSWORD:-}" && -n "${DB_NAME:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" ]]; then
    cat > "${SCRIPT_DIR}/.env" <<EOF
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
DB_PREVIOUS_ROOT_PASSWORD=${DB_PREVIOUS_ROOT_PASSWORD:-}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_ALLOWED_HOST=${DB_ALLOWED_HOST:-%}
DB_BIND_ADDRESS=${DB_BIND_ADDRESS:-0.0.0.0}
EOF
    return
  fi

  cat > "${SCRIPT_DIR}/.env" <<'EOF'
DB_ROOT_PASSWORD=RootPass123!
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=AppDbPass123!
DB_ALLOWED_HOST=%
DB_BIND_ADDRESS=0.0.0.0
EOF
  echo "Created ${SCRIPT_DIR}/.env template. Fill it out and run again."
  exit 1
}

ensure_env_file

set -a
source "${SCRIPT_DIR}/.env"
set +a

for required_variable in DB_ROOT_PASSWORD DB_NAME DB_USER DB_PASSWORD DB_ALLOWED_HOST DB_BIND_ADDRESS; do
  require_env_value "${required_variable}"
done

for password_variable in DB_ROOT_PASSWORD DB_PASSWORD; do
  password_value="${!password_variable}"
  if (( ${#password_value} < 2 || ${#password_value} > 21 )); then
    echo "${password_variable} must be 2-21 characters for NCP Cloud DB compatibility." >&2
    exit 1
  fi
done

db_root_password_sql="$(escape_sql_string "${DB_ROOT_PASSWORD}")"
db_name_sql="$(escape_sql_identifier "${DB_NAME}")"
db_user_sql="$(escape_sql_string "${DB_USER}")"
db_password_sql="$(escape_sql_string "${DB_PASSWORD}")"
db_allowed_host_sql="$(escape_sql_string "${DB_ALLOWED_HOST}")"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y mariadb-server

sed -i "s/^bind-address.*/bind-address = ${DB_BIND_ADDRESS}/" "${MARIADB_CONF}"

systemctl enable mariadb
systemctl restart mariadb

run_mariadb_root "
ALTER USER 'root'@'localhost' IDENTIFIED BY '${db_root_password_sql}';
DELETE FROM mysql.user WHERE User='';
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
CREATE DATABASE IF NOT EXISTS \`${db_name_sql}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${db_user_sql}'@'${db_allowed_host_sql}' IDENTIFIED BY '${db_password_sql}';
ALTER USER '${db_user_sql}'@'${db_allowed_host_sql}' IDENTIFIED BY '${db_password_sql}';
GRANT ALL PRIVILEGES ON \`${db_name_sql}\`.* TO '${db_user_sql}'@'${db_allowed_host_sql}';
FLUSH PRIVILEGES;
USE \`${db_name_sql}\`;
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_name VARCHAR(100) NOT NULL DEFAULT '비가입 유저',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
INSERT INTO posts (title, content, author_name)
SELECT '환영합니다', 'Chapter 3 게시판 DB 연결이 완료되었습니다.', '비가입 유저'
WHERE NOT EXISTS (
  SELECT 1 FROM posts WHERE title = '환영합니다'
);
"

systemctl restart mariadb

echo
echo "DB installation complete."
echo "Database : ${DB_NAME}"
echo "DB User  : ${DB_USER}"
echo "Password : synchronized from .env"
echo "Bind IP  : ${DB_BIND_ADDRESS}"
