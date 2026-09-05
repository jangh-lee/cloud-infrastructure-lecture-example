resource "ncloud_vpc" "lab" {
  name            = "${var.name_prefix}-vpc"
  ipv4_cidr_block = local.vpc_cidr
}

resource "ncloud_subnet" "public_kr1" {
  name           = "${var.name_prefix}-sub-pub-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = local.public_kr1_cidr
  zone           = var.zone_kr1
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PUBLIC"
  usage_type     = "GEN"
}

resource "ncloud_subnet" "nat_kr2" {
  name           = "${var.name_prefix}-sub-pub-kr2"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = local.nat_kr2_cidr
  zone           = var.zone_kr2
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PUBLIC"
  usage_type     = "NATGW"
}

resource "ncloud_subnet" "lb_kr1" {
  name           = "${var.name_prefix}-sub-lb-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = local.lb_kr1_cidr
  zone           = var.zone_kr1
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PUBLIC"
  usage_type     = "LOADB"
}

resource "ncloud_subnet" "private_kr1" {
  name           = "${var.name_prefix}-sub-pri-kr1"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = local.private_kr1_cidr
  zone           = var.zone_kr1
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
}

resource "ncloud_subnet" "private_kr2" {
  name           = "${var.name_prefix}-sub-pri-kr2"
  vpc_no         = ncloud_vpc.lab.id
  subnet         = local.private_kr2_cidr
  zone           = var.zone_kr2
  network_acl_no = ncloud_vpc.lab.default_network_acl_no
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
}

resource "ncloud_nat_gateway" "lab" {
  name      = "${var.name_prefix}-natgw-kr2"
  vpc_no    = ncloud_vpc.lab.id
  subnet_no = ncloud_subnet.nat_kr2.id
  zone      = var.zone_kr2
}

resource "ncloud_route" "private_nat" {
  route_table_no         = ncloud_vpc.lab.default_private_route_table_no
  destination_cidr_block = "0.0.0.0/0"
  target_type            = "NATGW"
  target_name            = ncloud_nat_gateway.lab.name
  target_no              = ncloud_nat_gateway.lab.id
}
