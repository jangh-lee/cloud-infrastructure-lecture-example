locals {
  db_name          = "chapter3_board"
  db_user          = "chapter3_user"
  db_password      = var.board_db_password
  backend_port     = 4000
  backend_base_url = "/backend-api"
}

resource "ncloud_vpc" "lab" {
  name            = "vpc-${var.name_prefix}"
  ipv4_cidr_block = "10.11.0.0/16"
}

resource "ncloud_subnet" "public" {
  name           = "sub-${var.name_prefix}-pub-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = "10.11.1.0/24"
  zone           = var.zone
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PUBLIC"
  usage_type     = "GEN"
}

resource "ncloud_subnet" "private" {
  name           = "sub-${var.name_prefix}-pri-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = "10.11.2.0/24"
  zone           = var.zone
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
}

resource "ncloud_subnet" "nat" {
  name           = "sub-${var.name_prefix}-nat-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = "10.11.3.0/24"
  zone           = var.zone
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PUBLIC"
  usage_type     = "NATGW"
}

resource "ncloud_nat_gateway" "lab" {
  name      = "natgw-${var.name_prefix}-kr1"
  vpc_no    = ncloud_vpc.lab.id
  subnet_no = ncloud_subnet.nat.id
  zone      = var.zone
}

resource "ncloud_route" "private_nat" {
  route_table_no         = ncloud_vpc.lab.default_private_route_table_no
  destination_cidr_block = "0.0.0.0/0"
  target_type            = "NATGW"
  target_name            = ncloud_nat_gateway.lab.name
  target_no              = ncloud_nat_gateway.lab.id
}

resource "ncloud_access_control_group" "bastion" {
  name        = "${var.name_prefix}-bastion-acg"
  description = "Terraform lab bastion access"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group" "app" {
  name        = "${var.name_prefix}-app-acg"
  description = "Terraform lab board app access"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group" "db" {
  name        = "${var.name_prefix}-db-acg"
  description = "Terraform lab database access"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group_rule" "bastion" {
  access_control_group_no = ncloud_access_control_group.bastion.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.my_public_ip
    port_range  = "22"
    description = "SSH from allowed source"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Allow outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Allow outbound UDP"
  }
}

resource "ncloud_access_control_group_rule" "app" {
  access_control_group_no = ncloud_access_control_group.app.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.my_public_ip
    port_range  = "22"
    description = "SSH from allowed source"
  }

  inbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "80"
    description = "HTTP"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Allow outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Allow outbound UDP"
  }
}

resource "ncloud_access_control_group_rule" "db" {
  access_control_group_no = ncloud_access_control_group.db.id

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.bastion.id
    port_range                     = "22"
    description                    = "SSH from bastion"
  }

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.app.id
    port_range                     = "3306"
    description                    = "MySQL from app"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Allow outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Allow outbound UDP"
  }
}

resource "ncloud_network_interface" "bastion" {
  name                  = "nic-${var.name_prefix}-bastion"
  subnet_no             = ncloud_subnet.public.id
  access_control_groups = [ncloud_access_control_group.bastion.id]
}

resource "ncloud_network_interface" "app" {
  name                  = "nic-${var.name_prefix}-app"
  subnet_no             = ncloud_subnet.public.id
  access_control_groups = [ncloud_access_control_group.app.id]
}

resource "ncloud_network_interface" "db" {
  name                  = "nic-${var.name_prefix}-db"
  subnet_no             = ncloud_subnet.private.id
  access_control_groups = [ncloud_access_control_group.db.id]
}

resource "ncloud_login_key" "lab" {
  key_name = "key-${var.name_prefix}"
}

resource "local_file" "login_key_pem" {
  filename        = "${path.module}/key-${var.name_prefix}.pem"
  content         = ncloud_login_key.lab.private_key
  file_permission = "0400"
}

resource "ncloud_init_script" "bastion" {
  name = "init-${var.name_prefix}-bastion"

  content = <<-EOT
#!/bin/bash
set -e
exec > >(tee -a /var/log/lab11-init.log) 2>&1

echo "[lab11] bastion init started at $(date -Is)"

apt-get update
apt-get install -y git curl netcat-openbsd

echo "[lab11] bastion init finished at $(date -Is)"
EOT
}

resource "ncloud_init_script" "db" {
  name = "init-${var.name_prefix}-board-db"

  content = <<-EOT
#!/bin/bash
set -e
exec > >(tee -a /var/log/lab11-init.log) 2>&1

echo "[lab11] db init started at $(date -Is)"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y mariadb-server

sed -i "s/^bind-address.*/bind-address = 0.0.0.0/" /etc/mysql/mariadb.conf.d/50-server.cnf

systemctl enable mariadb
systemctl restart mariadb

mariadb -u root <<'SQL'
ALTER USER 'root'@'localhost' IDENTIFIED BY '${var.db_root_password}';
DELETE FROM mysql.user WHERE User='';
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\_%';
FLUSH PRIVILEGES;
CREATE DATABASE IF NOT EXISTS `${local.db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${local.db_user}'@'10.11.1.%' IDENTIFIED BY '${local.db_password}';
GRANT ALL PRIVILEGES ON `${local.db_name}`.* TO '${local.db_user}'@'10.11.1.%';
FLUSH PRIVILEGES;
USE `${local.db_name}`;
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_name VARCHAR(100) NOT NULL DEFAULT '비가입 유저',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
INSERT INTO posts (title, content, author_name)
SELECT '환영합니다', 'Terraform 게시판 DB 연결이 완료되었습니다.', '비가입 유저'
WHERE NOT EXISTS (
  SELECT 1 FROM posts WHERE title = '환영합니다'
);
SQL

systemctl restart mariadb

echo "[lab11] db init finished at $(date -Is)"
EOT
}

resource "ncloud_init_script" "app" {
  name = "init-${var.name_prefix}-board-app"

  content = <<-EOT
#!/bin/bash
set -e
exec > >(tee -a /var/log/lab11-init.log) 2>&1

echo "[lab11] app init started at $(date -Is)"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx python3-flask python3-pymysql

mkdir -p /opt/terraform-board /var/www/terraform-board

cat > /opt/terraform-board/app.py <<'PY'
from flask import Flask, jsonify, request
import pymysql

app = Flask(__name__)

DB_CONFIG = {
    "host": "${ncloud_network_interface.db.private_ip}",
    "port": 3306,
    "user": "${local.db_user}",
    "password": "${local.db_password}",
    "database": "${local.db_name}",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

def connection():
    return pymysql.connect(**DB_CONFIG)

@app.get("/api/health")
def health():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    return jsonify({"status": "ok", "service": "terraform-board"})

@app.get("/api/posts")
def list_posts():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, content, author_name AS authorName, created_at AS createdAt
                FROM posts
                ORDER BY id DESC
            """)
            rows = cur.fetchall()
    return jsonify(rows)

@app.post("/api/posts")
def create_post():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()
    content = str(payload.get("content", "")).strip()
    author_name = str(payload.get("authorName", "비가입 유저")).strip() or "비가입 유저"

    if not title or not content:
        return jsonify({"message": "title and content are required"}), 400

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO posts (title, content, author_name) VALUES (%s, %s, %s)",
                (title, content, author_name),
            )
            post_id = cur.lastrowid
        conn.commit()

    return jsonify({"id": post_id, "title": title, "content": content, "authorName": author_name}), 201

@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM posts WHERE id = %s", (post_id,))
            deleted = cur.rowcount
        conn.commit()
    if deleted == 0:
        return jsonify({"message": "Post not found"}), 404
    return ("", 204)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=${local.backend_port})
PY

cat > /etc/systemd/system/terraform-board.service <<'SERVICE'
[Unit]
Description=Terraform board API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/terraform-board
ExecStart=/usr/bin/python3 /opt/terraform-board/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE

cat > /var/www/terraform-board/styles.css <<'CSS'
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Arial, sans-serif;
  color: #172033;
  background: #f3f6fb;
}
main {
  width: min(960px, calc(100% - 32px));
  margin: 40px auto;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
h1 { margin: 0; font-size: 30px; }
.status { padding: 8px 12px; border-radius: 999px; background: #e8eef8; font-size: 14px; }
.ok { background: #d9f8e6; color: #136b35; }
.fail { background: #ffe0e0; color: #9f1f1f; }
.panel {
  background: #fff;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 18px;
  box-shadow: 0 8px 24px rgba(18, 32, 56, 0.08);
}
label { display: block; font-weight: 700; margin: 12px 0 6px; }
input, textarea {
  width: 100%;
  border: 1px solid #c8d2e3;
  border-radius: 6px;
  padding: 10px 12px;
  font: inherit;
}
textarea { min-height: 110px; resize: vertical; }
button {
  border: 0;
  border-radius: 6px;
  background: #2358d4;
  color: #fff;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
.ghost { background: #edf2fb; color: #1c315b; }
.actions { display: flex; gap: 8px; margin-top: 14px; }
.post { border-top: 1px solid #e5ebf5; padding: 16px 0; }
.post:first-child { border-top: 0; }
.post-head { display: flex; justify-content: space-between; gap: 12px; }
.post h3 { margin: 0 0 6px; }
.meta { color: #60708a; font-size: 13px; }
.body { white-space: pre-wrap; line-height: 1.6; }
CSS

cat > /var/www/terraform-board/app.js <<'JS'
const apiBase = "/backend-api";
const statusEl = document.querySelector("#status");
const listEl = document.querySelector("#posts");
const formEl = document.querySelector("#postForm");

function setStatus(ok, text) {
  statusEl.textContent = text;
  statusEl.className = ok ? "status ok" : "status fail";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function checkHealth() {
  try {
    const res = await fetch(`$${apiBase}/api/health`);
    if (!res.ok) throw new Error("health failed");
    setStatus(true, "Backend Connected");
  } catch {
    setStatus(false, "Backend Unreachable");
  }
}

async function loadPosts() {
  const res = await fetch(`$${apiBase}/api/posts`);
  const posts = await res.json();
  listEl.innerHTML = posts.map((post) => `
    <article class="post">
      <div class="post-head">
        <div>
          <h3>$${escapeHtml(post.title)}</h3>
          <div class="meta">$${escapeHtml(post.authorName)} · $${new Date(post.createdAt).toLocaleString("ko-KR")}</div>
        </div>
        <button class="ghost" data-delete="$${post.id}" type="button">삭제</button>
      </div>
      <p class="body">$${escapeHtml(post.content)}</p>
    </article>
  `).join("") || "<p>아직 게시글이 없습니다.</p>";
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = document.querySelector("#title").value.trim();
  const content = document.querySelector("#content").value.trim();
  const res = await fetch(`$${apiBase}/api/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, authorName: "비가입 유저" })
  });
  if (!res.ok) {
    alert("게시글 저장에 실패했습니다.");
    return;
  }
  formEl.reset();
  await loadPosts();
});

listEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  await fetch(`$${apiBase}/api/posts/$${button.dataset.delete}`, { method: "DELETE" });
  await loadPosts();
});

document.querySelector("#refresh").addEventListener("click", loadPosts);
checkHealth();
loadPosts();
JS

python3 - <<'PY'
from pathlib import Path

lt = chr(60)
gt = chr(62)
html = f"""<!doctype html>
{lt}html lang="ko"{gt}
{lt}head{gt}
  {lt}meta charset="utf-8"{gt}
  {lt}meta name="viewport" content="width=device-width, initial-scale=1"{gt}
  {lt}title{gt}Terraform Board Lab{lt}/title{gt}
  {lt}link rel="stylesheet" href="/styles.css"{gt}
{lt}/head{gt}
{lt}body{gt}
  {lt}main{gt}
    {lt}div class="topbar"{gt}
      {lt}h1{gt}Terraform Board Lab{lt}/h1{gt}
      {lt}span id="status" class="status"{gt}Checking...{lt}/span{gt}
    {lt}/div{gt}
    {lt}section class="panel"{gt}
      {lt}form id="postForm"{gt}
        {lt}label for="title"{gt}제목{lt}/label{gt}
        {lt}input id="title" required maxlength="200"{gt}
        {lt}label for="content"{gt}내용{lt}/label{gt}
        {lt}textarea id="content" required{gt}{lt}/textarea{gt}
        {lt}div class="actions"{gt}
          {lt}button type="submit"{gt}게시글 저장{lt}/button{gt}
          {lt}button id="refresh" class="ghost" type="button"{gt}새로고침{lt}/button{gt}
        {lt}/div{gt}
      {lt}/form{gt}
    {lt}/section{gt}
    {lt}section class="panel" id="posts"{gt}{lt}/section{gt}
  {lt}/main{gt}
  {lt}script src="/app.js"{gt}{lt}/script{gt}
{lt}/body{gt}
{lt}/html{gt}
"""
Path("/var/www/terraform-board/index.html").write_text(html, encoding="utf-8")
PY

cat > /etc/nginx/snippets/lab11-backend-proxy.conf <<'NGINX'
location /backend-api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
NGINX

sed -i '/listen \[::\]:80/d' /etc/nginx/sites-available/chapter3-web
cat > /etc/nginx/sites-available/terraform-board <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    root /var/www/terraform-board;
    index index.html;

    include /etc/nginx/snippets/lab11-backend-proxy.conf;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/chapter3-web
ln -sf /etc/nginx/sites-available/terraform-board /etc/nginx/sites-enabled/terraform-board

systemctl daemon-reload
systemctl enable terraform-board.service
systemctl restart terraform-board.service

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[lab11] app init finished at $(date -Is)"
EOT
}

resource "ncloud_server" "bastion" {
  name                          = "svr-${var.name_prefix}-bastion-kr1"
  zone                          = var.zone
  subnet_no                     = ncloud_subnet.public.id
  server_image_number           = var.server_image_number
  server_spec_code              = var.server_spec_code
  login_key_name                = ncloud_login_key.lab.key_name
  init_script_no                = ncloud_init_script.bastion.id
  fee_system_type_code          = "MTRAT"
  is_protect_server_termination = false

  network_interface {
    network_interface_no = ncloud_network_interface.bastion.id
    order                = 0
  }
}

resource "ncloud_server" "db" {
  name                          = "svr-${var.name_prefix}-db-kr1"
  zone                          = var.zone
  subnet_no                     = ncloud_subnet.private.id
  server_image_number           = var.server_image_number
  server_spec_code              = var.server_spec_code
  login_key_name                = ncloud_login_key.lab.key_name
  init_script_no                = ncloud_init_script.db.id
  fee_system_type_code          = "MTRAT"
  is_protect_server_termination = false

  network_interface {
    network_interface_no = ncloud_network_interface.db.id
    order                = 0
  }

  depends_on = [ncloud_route.private_nat]
}

resource "ncloud_server" "app" {
  name                          = "svr-${var.name_prefix}-app-kr1"
  zone                          = var.zone
  subnet_no                     = ncloud_subnet.public.id
  server_image_number           = var.server_image_number
  server_spec_code              = var.server_spec_code
  login_key_name                = ncloud_login_key.lab.key_name
  init_script_no                = ncloud_init_script.app.id
  fee_system_type_code          = "MTRAT"
  is_protect_server_termination = false

  network_interface {
    network_interface_no = ncloud_network_interface.app.id
    order                = 0
  }

  depends_on = [ncloud_server.db]
}

resource "ncloud_public_ip" "bastion" {
  server_instance_no = ncloud_server.bastion.id

  lifecycle {
    replace_triggered_by = [ncloud_server.bastion]
  }
}

resource "ncloud_public_ip" "app" {
  server_instance_no = ncloud_server.app.id

  lifecycle {
    replace_triggered_by = [ncloud_server.app]
  }
}

data "ncloud_root_password" "bastion" {
  server_instance_no = ncloud_server.bastion.id
  private_key        = ncloud_login_key.lab.private_key
}

data "ncloud_root_password" "app" {
  server_instance_no = ncloud_server.app.id
  private_key        = ncloud_login_key.lab.private_key
}

data "ncloud_root_password" "db" {
  server_instance_no = ncloud_server.db.id
  private_key        = ncloud_login_key.lab.private_key
}
