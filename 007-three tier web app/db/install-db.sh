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

  mariadb -u root -p"${DB_ROOT_PASSWORD}" <<EOF
${sql}
EOF
}

ensure_env_file() {
  if [[ -f "${SCRIPT_DIR}/.env" ]]; then
    return
  fi

  if [[ -n "${DB_ROOT_PASSWORD:-}" && -n "${DB_NAME:-}" && -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" ]]; then
    cat > "${SCRIPT_DIR}/.env" <<EOF
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_ALLOWED_HOST=${DB_ALLOWED_HOST:-%}
DB_BIND_ADDRESS=${DB_BIND_ADDRESS:-0.0.0.0}
EOF
    return
  fi

  cat > "${SCRIPT_DIR}/.env" <<'EOF'
DB_ROOT_PASSWORD=ChangeRootPassword123!
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=ChangeThisPassword123!
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

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y mariadb-server

sed -i "s/^bind-address.*/bind-address = ${DB_BIND_ADDRESS}/" "${MARIADB_CONF}"

systemctl enable mariadb
systemctl restart mariadb

run_mariadb_root "
ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_ROOT_PASSWORD}';
DELETE FROM mysql.user WHERE User='';
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'${DB_ALLOWED_HOST}' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'${DB_ALLOWED_HOST}';
FLUSH PRIVILEGES;
USE \`${DB_NAME}\`;
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
echo "Bind IP  : ${DB_BIND_ADDRESS}"
