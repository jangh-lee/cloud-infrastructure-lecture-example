#!/usr/bin/env bash
# Run on the disposable lab's bastion. Passwords are entered only into SSH.
set -euo pipefail

usage() {
  echo "Usage: setup-internal-ssh [all|web|backend|db]"
  echo "Run on bastion as root; enter each server's Ncloud admin password once."
}

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

case "${1:-all}" in
  all) targets=(web backend db) ;;
  web|backend|db) targets=("$1") ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

if [[ $(id -u) -ne 0 ]]; then
  echo "Log in to bastion as root, then run setup-internal-ssh." >&2
  exit 1
fi

ssh_dir=/root/.ssh
key_file="$ssh_dir/lab_internal"
for command_name in ssh ssh-keygen ssh-copy-id; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing $command_name. Wait for bastion initialization to finish." >&2
    exit 1
  fi
done

# Check every alias before generating a key or contacting a server.
for target in "${targets[@]}"; do
  target_ip=$(ssh -G "$target" | awk '$1 == "hostname" {print $2}')
  if [[ "$target_ip" == "$target" || -z "$target_ip" ]]; then
    echo "SSH alias $target is missing. Wait for bastion initialization to finish." >&2
    exit 1
  fi
done

umask 077
mkdir -p "$ssh_dir"
chmod 0700 "$ssh_dir"
if [[ ! -e "$key_file" ]]; then
  echo "Creating a dedicated, passphrase-free key for this disposable lab."
  ssh-keygen -q -t ed25519 -N '' -C 'bastion-internal-lab' -f "$key_file"
else
  echo "Reusing the existing internal SSH key."
fi
chmod 0600 "$key_file"
# Reconstruct the public key if it is missing; never replace the private key.
ssh-keygen -y -f "$key_file" > "$key_file.pub"
chmod 0600 "$key_file.pub"

failed_targets=()
for target in "${targets[@]}"; do
  target_ip=$(ssh -G "$target" | awk '$1 == "hostname" {print $2}')
  printf '\n[%s / %s] Enter this server\047s Ncloud admin password when prompted.\n' "$target" "$target_ip"
  # ssh-copy-id skips a public key that is already authorized.
  if ssh-copy-id -i "$key_file.pub" "$target" &&
    ssh -o BatchMode=yes -o PreferredAuthentications=publickey "$target" 'hostname'; then
    echo "Ready: ssh $target"
  else
    failed_targets+=("$target")
    echo "Could not configure $target. Check its password, ACG and initialization." >&2
  fi
done

if [[ ${#failed_targets[@]} -gt 0 ]]; then
  printf '\nRetry each failed server:\n' >&2
  for target in "${failed_targets[@]}"; do
    echo "  setup-internal-ssh $target" >&2
  done
  exit 1
fi

printf '\nReady. Use ssh web, ssh backend or ssh db; exit returns to bastion.\n'
