resource "ncloud_lb" "web" {
  name            = "${var.name_prefix}-web-alb"
  network_type    = "PUBLIC"
  type            = "APPLICATION"
  throughput_type = "SMALL"
  subnet_no_list  = [ncloud_subnet.lb_kr1.id]
  idle_timeout    = 60
  description     = "Public entry point for the 003 board web server"
}

resource "ncloud_lb_target_group" "web" {
  name               = "${var.name_prefix}-web-tg"
  vpc_no             = ncloud_vpc.lab.id
  protocol           = "HTTP"
  target_type        = "VSVR"
  port               = 80
  algorithm_type     = "RR"
  use_sticky_session = false

  health_check {
    protocol       = "HTTP"
    http_method    = "GET"
    port           = 80
    url_path       = "/healthz"
    cycle          = 10
    up_threshold   = 2
    down_threshold = 2
  }
}

resource "ncloud_lb_target_group_attachment" "web" {
  target_group_no = ncloud_lb_target_group.web.target_group_no
  target_no_list  = [ncloud_server.web.instance_no]
}

resource "ncloud_lb_listener" "http" {
  load_balancer_no = ncloud_lb.web.load_balancer_no
  protocol         = "HTTP"
  port             = 80
  target_group_no  = ncloud_lb_target_group.web.target_group_no
}
