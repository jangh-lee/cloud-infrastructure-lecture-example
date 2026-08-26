#!/usr/bin/env bash

set -euo pipefail

SOURCE_DB_ROOT_PASSWORD="${SOURCE_DB_ROOT_PASSWORD:-}"

if [[ -z "${SOURCE_DB_ROOT_PASSWORD}" ]]; then
  echo "SOURCE_DB_ROOT_PASSWORD is required."
  exit 1
fi

mysql -u root -p"${SOURCE_DB_ROOT_PASSWORD}" <<'SQL'
SHOW VARIABLES WHERE Variable_name IN ('server_id', 'log_bin', 'binlog_format', 'expire_logs_days', 'bind_address');
SHOW MASTER STATUS;
SQL
