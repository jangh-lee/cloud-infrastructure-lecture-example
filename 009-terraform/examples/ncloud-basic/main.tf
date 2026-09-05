locals {
  vpc_cidr            = "10.10.0.0/16"
  public_kr1_cidr     = "10.10.10.0/24"
  nat_kr2_cidr        = "10.10.20.0/24"
  lb_kr1_cidr         = "10.10.30.0/24"
  private_kr1_cidr    = "10.10.110.0/24"
  private_kr2_cidr    = "10.10.120.0/24"
  db_name             = "board_service"
  db_user             = "board_app"
  backend_port        = 4000
  init_log            = "/var/log/${var.name_prefix}-init.log"
  github_raw_base_url = "https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main"
}
