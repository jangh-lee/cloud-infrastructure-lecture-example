#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/create-server.env}"
EXECUTE="false"

if [[ "${1:-}" == "--execute" ]]; then
  EXECUTE="true"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} does not exist." >&2
  echo "Copy the example first:" >&2
  echo "  cp ${SCRIPT_DIR}/create-server.env.example ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

required_vars=(
  REGION_CODE
  VPC_NO
  SUBNET_NO
  ACG_NO
  SERVER_IMAGE_PRODUCT_CODE
  SERVER_PRODUCT_CODE
  SERVER_NAME
  LOGIN_KEY_NAME
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "${var_name} is required in ${ENV_FILE}." >&2
    exit 1
  fi
done

cmd=(
  ncloud vserver createServerInstances
  --vpcNo "${VPC_NO}"
  --subnetNo "${SUBNET_NO}"
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['${ACG_NO}']"
  --serverImageProductCode "${SERVER_IMAGE_PRODUCT_CODE}"
  --serverProductCode "${SERVER_PRODUCT_CODE}"
  --serverName "${SERVER_NAME}"
  --loginKeyName "${LOGIN_KEY_NAME}"
  --associateWithPublicIp "${ASSOCIATE_WITH_PUBLIC_IP:-true}"
  --regionCode "${REGION_CODE}"
  --output json
)

if [[ -n "${INIT_SCRIPT_NO:-}" ]]; then
  cmd+=(--initScriptNo "${INIT_SCRIPT_NO}")
fi

if [[ -n "${PROFILE:-}" ]]; then
  cmd+=(--profile "${PROFILE}")
fi

print_copyable_command() {
  cat <<COMMAND
ncloud vserver createServerInstances \\
  --vpcNo "${VPC_NO}" \\
  --subnetNo "${SUBNET_NO}" \\
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['${ACG_NO}']" \\
  --serverImageProductCode "${SERVER_IMAGE_PRODUCT_CODE}" \\
  --serverProductCode "${SERVER_PRODUCT_CODE}" \\
  --serverName "${SERVER_NAME}" \\
  --loginKeyName "${LOGIN_KEY_NAME}" \\
  --associateWithPublicIp "${ASSOCIATE_WITH_PUBLIC_IP:-true}" \\
  --regionCode "${REGION_CODE}" \\
  --output json$(if [[ -n "${INIT_SCRIPT_NO:-}" ]]; then printf ' \\\n  --initScriptNo "%s"' "${INIT_SCRIPT_NO}"; fi)$(if [[ -n "${PROFILE:-}" ]]; then printf ' \\\n  --profile "%s"' "${PROFILE}"; fi)
COMMAND
}

printf 'Generated command:\n\n'
print_copyable_command
printf '\n\n'

if [[ "${EXECUTE}" == "true" ]]; then
  echo "Executing createServerInstances..."
  "${cmd[@]}"
else
  echo "Dry run only. Execute with: ./scripts/create-server.sh --execute"
fi
