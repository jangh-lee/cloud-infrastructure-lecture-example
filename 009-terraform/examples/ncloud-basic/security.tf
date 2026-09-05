resource "ncloud_access_control_group" "bastion" {
  name        = "${var.name_prefix}-bastion-acg"
  description = "SSH entry point for the Terraform lab"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group" "web" {
  name        = "${var.name_prefix}-web-acg"
  description = "Web traffic from the public ALB"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group" "backend" {
  name        = "${var.name_prefix}-backend-acg"
  description = "Backend API traffic from the web server"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group" "db" {
  name        = "${var.name_prefix}-db-acg"
  description = "MariaDB traffic from the backend server"
  vpc_no      = ncloud_vpc.lab.id
}

resource "ncloud_access_control_group_rule" "bastion" {
  access_control_group_no = ncloud_access_control_group.bastion.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.my_public_ip
    port_range  = "22"
    description = "SSH from the administrator"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound UDP"
  }
}

resource "ncloud_access_control_group_rule" "web" {
  access_control_group_no = ncloud_access_control_group.web.id

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.bastion.id
    port_range                     = "22"
    description                    = "SSH from the bastion"
  }

  inbound {
    protocol    = "TCP"
    ip_block    = local.lb_kr1_cidr
    port_range  = "80"
    description = "HTTP from the load balancer subnet"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound UDP"
  }
}

resource "ncloud_access_control_group_rule" "backend" {
  access_control_group_no = ncloud_access_control_group.backend.id

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.bastion.id
    port_range                     = "22"
    description                    = "SSH from the bastion"
  }

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.web.id
    port_range                     = tostring(local.backend_port)
    description                    = "Board API from the web server"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound UDP"
  }
}

resource "ncloud_access_control_group_rule" "db" {
  access_control_group_no = ncloud_access_control_group.db.id

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.bastion.id
    port_range                     = "22"
    description                    = "SSH from the bastion"
  }

  inbound {
    protocol                       = "TCP"
    source_access_control_group_no = ncloud_access_control_group.backend.id
    port_range                     = "3306"
    description                    = "MariaDB from the backend server"
  }

  outbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound TCP"
  }

  outbound {
    protocol    = "UDP"
    ip_block    = "0.0.0.0/0"
    port_range  = "1-65535"
    description = "Outbound UDP"
  }
}
