resource "ncloud_vpc" "lab" {
  name            = "vpc-lab11"
  ipv4_cidr_block = "10.11.0.0/16"
}

resource "ncloud_subnet" "public" {
  name           = "sub-lab11-pub-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = "10.11.1.0/24"
  zone           = var.zone
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PUBLIC"
  usage_type     = "GEN"
}

resource "ncloud_subnet" "private" {
  name           = "sub-lab11-pri-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = "10.11.2.0/24"
  zone           = var.zone
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
}

resource "ncloud_access_control_group" "web" {
  name        = "lab11-acg"
  description = "Terraform lab web access"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group_rule" "web" {
  access_control_group_no = ncloud_access_control_group.web.id

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

resource "ncloud_network_interface" "web" {
  name                  = "nic-lab11-web"
  subnet_no             = ncloud_subnet.public.id
  access_control_groups = [ncloud_access_control_group.web.id]
}

resource "ncloud_login_key" "web" {
  key_name = "key-lab11"
}

resource "local_file" "login_key_pem" {
  filename        = "${path.module}/key-lab11.pem"
  content         = ncloud_login_key.web.private_key
  file_permission = "0400"
}

resource "ncloud_init_script" "web" {
  name = "init-lab11-nginx"

  content = <<-EOT
#!/bin/bash
set -e

apt-get update
apt-get install -y nginx

cat > /var/www/html/index.txt <<'TEXT'
Terraform NCP Lab
This server was created by Terraform.
TEXT

cat > /var/www/html/index.html <<'HTML'
Terraform NCP Lab

This server was created by Terraform.
HTML

systemctl enable nginx
systemctl restart nginx
EOT
}

resource "ncloud_server" "web" {
  name                          = "svr-lab11-web-kr1"
  zone                          = var.zone
  subnet_no                     = ncloud_subnet.public.id
  server_image_number           = var.server_image_number
  server_spec_code              = var.server_spec_code
  login_key_name                = ncloud_login_key.web.key_name
  init_script_no                = ncloud_init_script.web.id
  fee_system_type_code          = "MTRAT"
  is_protect_server_termination = false

  network_interface {
    network_interface_no = ncloud_network_interface.web.id
    order                = 0
  }
}

resource "ncloud_public_ip" "web" {
  server_instance_no = ncloud_server.web.id
}
