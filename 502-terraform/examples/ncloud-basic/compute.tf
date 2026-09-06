resource "ncloud_login_key" "lab" {
  key_name = "${var.name_prefix}-key"
}

resource "local_file" "login_key_pem" {
  filename        = "${path.module}/${var.name_prefix}-key.pem"
  content         = ncloud_login_key.lab.private_key
  file_permission = "0400"
}

resource "ncloud_network_interface" "bastion" {
  name                  = "${var.name_prefix}-bastion-nic"
  subnet_no             = ncloud_subnet.public_kr1.id
  access_control_groups = [ncloud_access_control_group.bastion.id]
}

resource "ncloud_network_interface" "web" {
  name                  = "${var.name_prefix}-web-nic"
  subnet_no             = ncloud_subnet.private_kr1.id
  access_control_groups = [ncloud_access_control_group.web.id]
}

resource "ncloud_network_interface" "backend" {
  name                  = "${var.name_prefix}-backend-nic"
  subnet_no             = ncloud_subnet.private_kr1.id
  access_control_groups = [ncloud_access_control_group.backend.id]
}

resource "ncloud_network_interface" "db" {
  name                  = "${var.name_prefix}-db-nic"
  subnet_no             = ncloud_subnet.private_kr2.id
  access_control_groups = [ncloud_access_control_group.db.id]
}

resource "ncloud_server" "bastion" {
  name                          = "${var.name_prefix}-bastion"
  zone                          = var.zone_kr1
  subnet_no                     = ncloud_subnet.public_kr1.id
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
  name                          = "${var.name_prefix}-db"
  zone                          = var.zone_kr2
  subnet_no                     = ncloud_subnet.private_kr2.id
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

resource "ncloud_server" "backend" {
  name                          = "${var.name_prefix}-backend"
  zone                          = var.zone_kr1
  subnet_no                     = ncloud_subnet.private_kr1.id
  server_image_number           = var.server_image_number
  server_spec_code              = var.server_spec_code
  login_key_name                = ncloud_login_key.lab.key_name
  init_script_no                = ncloud_init_script.backend.id
  fee_system_type_code          = "MTRAT"
  is_protect_server_termination = false

  network_interface {
    network_interface_no = ncloud_network_interface.backend.id
    order                = 0
  }

  depends_on = [ncloud_route.private_nat, ncloud_server.db]
}

resource "ncloud_server" "web" {
  name                          = "${var.name_prefix}-web"
  zone                          = var.zone_kr1
  subnet_no                     = ncloud_subnet.private_kr1.id
  server_image_number           = var.server_image_number
  server_spec_code              = var.server_spec_code
  login_key_name                = ncloud_login_key.lab.key_name
  init_script_no                = ncloud_init_script.web.id
  fee_system_type_code          = "MTRAT"
  is_protect_server_termination = false

  network_interface {
    network_interface_no = ncloud_network_interface.web.id
    order                = 0
  }

  depends_on = [ncloud_route.private_nat, ncloud_server.backend]
}

resource "ncloud_public_ip" "bastion" {
  server_instance_no = ncloud_server.bastion.id

  lifecycle {
    replace_triggered_by = [ncloud_server.bastion]
  }
}

data "ncloud_root_password" "bastion" {
  server_instance_no = ncloud_server.bastion.id
  private_key        = ncloud_login_key.lab.private_key
}

data "ncloud_root_password" "web" {
  server_instance_no = ncloud_server.web.id
  private_key        = ncloud_login_key.lab.private_key
}

data "ncloud_root_password" "backend" {
  server_instance_no = ncloud_server.backend.id
  private_key        = ncloud_login_key.lab.private_key
}

data "ncloud_root_password" "db" {
  server_instance_no = ncloud_server.db.id
  private_key        = ncloud_login_key.lab.private_key
}
