#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo --preserve-env=userinput,SERVER_NAME bash "$0" "$@"
  fi

  echo "Root privileges are required."
  exit 1
fi

DISPLAY_NAME="${1:-${userinput:-${SERVER_NAME:-Load Balancer Lab}}}"
RAW_BASE="https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/012-load%20balancer"
INSTALLER_DIR="/opt/lb-demo-installer"

mkdir -p "${INSTALLER_DIR}/templates"

download() {
  local source_url="$1"
  local destination="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 5 --retry-delay 2 "${source_url}" -o "${destination}"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -q --tries=5 --waitretry=2 "${source_url}" -O "${destination}"
    return
  fi

  echo "curl or wget is required to download the installer."
  exit 1
}

download "${RAW_BASE}/install.sh" "${INSTALLER_DIR}/install.sh"
download "${RAW_BASE}/update_status.sh" "${INSTALLER_DIR}/update_status.sh"
download "${RAW_BASE}/templates/index.html.template" "${INSTALLER_DIR}/templates/index.html.template"

chmod 755 "${INSTALLER_DIR}/install.sh" "${INSTALLER_DIR}/update_status.sh"
userinput="${DISPLAY_NAME}" "${INSTALLER_DIR}/install.sh"
