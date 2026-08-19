#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ncp-db-writer"
APP_DIR="/opt/${APP_NAME}"
ENV_FILE="/etc/${APP_NAME}.env"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  sudo ./db-writer.sh install
  sudo ./db-writer.sh configure
  sudo ./db-writer.sh configure-plain
  sudo ./db-writer.sh start
  sudo ./db-writer.sh stop
  sudo ./db-writer.sh restart
  sudo ./db-writer.sh status
  sudo ./db-writer.sh logs
  sudo ./db-writer.sh send-once
  sudo ./db-writer.sh show-config

Commands:
  install      Install Python runtime, app files, and systemd service.
  configure   Prompt for DB connection values and save them to /etc/ncp-db-writer.env.
  configure-plain
               Same as configure, but shows the password while typing.
  start       Start and enable the 30-second DB writer service.
  stop        Stop the service.
  restart     Restart the service.
  status      Show systemd status.
  logs        Tail service logs.
  send-once   Insert one test row using saved DB settings.
  show-config Show saved settings with password masked.
USAGE
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Please run with sudo." >&2
    exit 1
  fi
}

read_with_default() {
  local prompt="$1"
  local default_value="$2"
  local value

  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " value
    printf '%s' "${value:-$default_value}"
  else
    read -r -p "${prompt}: " value
    printf '%s' "${value}"
  fi
}

read_secret() {
  local prompt="$1"
  local value
  read -r -s -p "${prompt}: " value
  echo
  printf '%s' "${value}"
}

strip_carriage_returns() {
  local value="$1"
  printf '%s' "${value//$'\r'/}"
}

env_line() {
  local key="$1"
  local value="$2"

  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"

  printf '%s="%s"\n' "${key}" "${value}"
}

validate_env_value() {
  local label="$1"
  local value="$2"

  if [[ "${value}" == *$'\n'* ]]; then
    echo "${label} contains a newline. Please type the value again without line breaks." >&2
    exit 1
  fi

  if [[ "${value}" =~ [[:cntrl:]] ]]; then
    echo "${label} contains a control character. Please type the value again." >&2
    exit 1
  fi
}

install_app() {
  require_root

  apt-get update
  apt-get install -y python3 python3-venv python3-pip

  mkdir -p "${APP_DIR}"
  cp "${SCRIPT_DIR}/db_writer.py" "${APP_DIR}/db_writer.py"
  chmod 0755 "${APP_DIR}/db_writer.py"

  python3 -m venv "${APP_DIR}/venv"
  "${APP_DIR}/venv/bin/pip" install --upgrade pip
  "${APP_DIR}/venv/bin/pip" install pymysql

  cat > "${SERVICE_FILE}" <<SERVICE
[Unit]
Description=NCP database recovery lab writer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/venv/bin/python ${APP_DIR}/db_writer.py run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload

  echo "Installed ${APP_NAME}."
  echo "Next: sudo ./db-writer.sh configure"
}

configure_app() {
  require_root

  local db_host db_port db_user db_password db_name db_table source_id interval
  local password_mode="${1:-secret}"

  db_host="$(read_with_default "DB host" "")"
  db_port="$(read_with_default "DB port" "3306")"
  db_user="$(read_with_default "DB user" "lecture_writer")"
  if [[ "${password_mode}" == "plain" ]]; then
    db_password="$(read_with_default "DB password (visible)" "")"
  else
    db_password="$(read_secret "DB password")"
  fi
  db_name="$(read_with_default "DB name" "lecture_recovery_lab")"
  db_table="$(read_with_default "DB table" "recovery_events")"
  source_id="$(read_with_default "Source ID" "$(hostname)")"
  interval="$(read_with_default "Write interval seconds" "30")"

  db_host="$(strip_carriage_returns "${db_host}")"
  db_port="$(strip_carriage_returns "${db_port}")"
  db_user="$(strip_carriage_returns "${db_user}")"
  db_password="$(strip_carriage_returns "${db_password}")"
  db_name="$(strip_carriage_returns "${db_name}")"
  db_table="$(strip_carriage_returns "${db_table}")"
  source_id="$(strip_carriage_returns "${source_id}")"
  interval="$(strip_carriage_returns "${interval}")"

  if [[ -z "${db_host}" || -z "${db_user}" || -z "${db_password}" ]]; then
    echo "DB host, user, and password are required." >&2
    exit 1
  fi

  if [[ ! "${db_port}" =~ ^[0-9]+$ || ! "${interval}" =~ ^[0-9]+$ ]]; then
    echo "DB port and write interval seconds must be numbers." >&2
    exit 1
  fi

  validate_env_value "DB host" "${db_host}"
  validate_env_value "DB port" "${db_port}"
  validate_env_value "DB user" "${db_user}"
  validate_env_value "DB password" "${db_password}"
  validate_env_value "DB name" "${db_name}"
  validate_env_value "DB table" "${db_table}"
  validate_env_value "Source ID" "${source_id}"
  validate_env_value "Write interval seconds" "${interval}"

  {
    env_line "DB_HOST" "${db_host}"
    env_line "DB_PORT" "${db_port}"
    env_line "DB_USER" "${db_user}"
    env_line "DB_PASSWORD" "${db_password}"
    env_line "DB_NAME" "${db_name}"
    env_line "DB_TABLE" "${db_table}"
    env_line "SOURCE_ID" "${source_id}"
    env_line "INTERVAL_SECONDS" "${interval}"
    env_line "DB_CONNECT_TIMEOUT" "10"
  } > "${ENV_FILE}"

  chmod 0600 "${ENV_FILE}"

  echo "Saved settings to ${ENV_FILE}."
}

ensure_installed() {
  if [[ ! -x "${APP_DIR}/venv/bin/python" || ! -f "${APP_DIR}/db_writer.py" ]]; then
    echo "${APP_NAME} is not installed. Run: sudo ./db-writer.sh install" >&2
    exit 1
  fi

  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "${ENV_FILE} does not exist. Run: sudo ./db-writer.sh configure" >&2
    exit 1
  fi
}

start_app() {
  require_root
  ensure_installed
  systemctl enable --now "${APP_NAME}"
  systemctl status "${APP_NAME}" --no-pager
}

stop_app() {
  require_root
  systemctl stop "${APP_NAME}"
}

restart_app() {
  require_root
  ensure_installed
  systemctl restart "${APP_NAME}"
  systemctl status "${APP_NAME}" --no-pager
}

status_app() {
  require_root
  systemctl status "${APP_NAME}" --no-pager
}

logs_app() {
  require_root
  journalctl -u "${APP_NAME}" -f
}

send_once() {
  require_root
  ensure_installed
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  "${APP_DIR}/venv/bin/python" "${APP_DIR}/db_writer.py" send-once
}

show_config() {
  require_root

  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "${ENV_FILE} does not exist."
    exit 1
  fi

  awk '
    /^DB_PASSWORD=/ {
      print "DB_PASSWORD=********"
      in_password = 1
      next
    }
    /^[A-Z0-9_]+=/ {
      in_password = 0
    }
    in_password {
      next
    }
    {
      print
    }
  ' "${ENV_FILE}"
}

main() {
  local command="${1:-}"

  case "${command}" in
    install) install_app ;;
    configure) configure_app secret ;;
    configure-plain) configure_app plain ;;
    start) start_app ;;
    stop) stop_app ;;
    restart) restart_app ;;
    status) status_app ;;
    logs) logs_app ;;
    send-once) send_once ;;
    show-config) show_config ;;
    ""|-h|--help|help) usage ;;
    *)
      echo "Unknown command: ${command}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
