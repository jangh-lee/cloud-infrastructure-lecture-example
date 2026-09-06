resource "ncloud_init_script" "bastion" {
  name = "${var.name_prefix}-bastion-init"

  content = <<-EOT
#!/usr/bin/env bash
set -euo pipefail
exec > >(tee -a ${local.init_log}) 2>&1

echo "[${var.name_prefix}] bastion init started at $(date -Is)"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl default-mysql-client netcat-openbsd
echo "[${var.name_prefix}] bastion init completed at $(date -Is)"
EOT
}

resource "ncloud_init_script" "db" {
  name = "${var.name_prefix}-db-init"

  content = <<-EOT
#!/usr/bin/env bash
set -euo pipefail
exec > >(tee -a ${local.init_log}) 2>&1

echo "[${var.name_prefix}] DB init started at $(date -Is)"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates

install_dir=/opt/${var.name_prefix}-setup/db
mkdir -p "$install_dir"
cd "$install_dir"

curl -fsSL "${local.github_raw_base_url}/003-three%20tier%20web%20app/db/install-db.sh" \
  -o install-db.sh

cat > .env <<'EOF'
DB_ROOT_PASSWORD=${var.db_root_password}
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=${local.db_name}
DB_USER=${local.db_user}
DB_PASSWORD=${var.board_db_password}
DB_ALLOWED_HOST=10.10.110.%
DB_BIND_ADDRESS=0.0.0.0
EOF

chmod +x install-db.sh
./install-db.sh
echo "[${var.name_prefix}] DB init completed at $(date -Is)"
EOT
}

resource "ncloud_init_script" "backend" {
  name = "${var.name_prefix}-backend-init"

  content = <<-EOT
#!/usr/bin/env bash
set -euo pipefail
exec > >(tee -a ${local.init_log}) 2>&1

echo "[${var.name_prefix}] Backend init started at $(date -Is)"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates

for attempt in $(seq 1 60); do
  if timeout 2 bash -c "</dev/tcp/${ncloud_network_interface.db.private_ip}/3306"; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "DB port did not become ready within 300 seconds" >&2
    exit 1
  fi
  sleep 5
done

install_dir=/opt/${var.name_prefix}-setup/backend
mkdir -p "$install_dir/app"
cd "$install_dir"

curl -fsSL "${local.github_raw_base_url}/003-three%20tier%20web%20app/backend/install-backend.sh" \
  -o install-backend.sh

cat > .env <<'EOF'
PORT=${local.backend_port}
DB_HOST=${ncloud_network_interface.db.private_ip}
DB_PORT=3306
DB_NAME=${local.db_name}
DB_USER=${local.db_user}
DB_PASSWORD=${var.board_db_password}
AUTO_POST_ENABLED=true
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:${local.backend_port}/api/posts
LAB_STRESS_ENABLED=false
EOF

chmod +x install-backend.sh
./install-backend.sh install
echo "[${var.name_prefix}] Backend init completed at $(date -Is)"
EOT
}

resource "ncloud_init_script" "web" {
  name = "${var.name_prefix}-web-init"

  content = <<-EOT
#!/usr/bin/env bash
set -euo pipefail
exec > >(tee -a ${local.init_log}) 2>&1

echo "[${var.name_prefix}] Web init started at $(date -Is)"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates

install_dir=/opt/${var.name_prefix}-setup/web
mkdir -p "$install_dir/app"
cd "$install_dir"

curl -fsSL "${local.github_raw_base_url}/003-three%20tier%20web%20app/web/install-web.sh" \
  -o install-web.sh

cat > .env <<'EOF'
SITE_BASE_URL=http://${ncloud_lb.web.domain}
BACKEND_UPSTREAM=http://${ncloud_network_interface.backend.private_ip}:${local.backend_port}
SITE_TITLE="DevForum Practice Board"
EOF

chmod +x install-web.sh
./install-web.sh install
echo "[${var.name_prefix}] Web init completed at $(date -Is)"
EOT
}
