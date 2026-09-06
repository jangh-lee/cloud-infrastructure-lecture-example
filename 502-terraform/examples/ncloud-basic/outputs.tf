output "board_url" {
  description = "Public URL for the 003 board application"
  value       = "http://${ncloud_lb.web.domain}/"
}

output "http_url" {
  description = "Backward-compatible alias for the board URL"
  value       = "http://${ncloud_lb.web.domain}/"
}

output "load_balancer_domain" {
  description = "Public ALB domain"
  value       = ncloud_lb.web.domain
}

output "bastion_public_ip" {
  description = "Bastion public IP address"
  value       = ncloud_public_ip.bastion.public_ip
}

output "web_private_ip" {
  description = "Web server private IP address"
  value       = ncloud_network_interface.web.private_ip
}

output "backend_private_ip" {
  description = "Backend server private IP address"
  value       = ncloud_network_interface.backend.private_ip
}

output "db_private_ip" {
  description = "DB server private IP address"
  value       = ncloud_network_interface.db.private_ip
}

output "network_info" {
  description = "Created VPC and subnet information"
  value = {
    vpc = {
      name = ncloud_vpc.lab.name
      no   = ncloud_vpc.lab.id
      cidr = local.vpc_cidr
    }
    public_kr1 = {
      name = ncloud_subnet.public_kr1.name
      no   = ncloud_subnet.public_kr1.id
      cidr = local.public_kr1_cidr
    }
    nat_kr2 = {
      name = ncloud_subnet.nat_kr2.name
      no   = ncloud_subnet.nat_kr2.id
      cidr = local.nat_kr2_cidr
    }
    load_balancer_kr1 = {
      name = ncloud_subnet.lb_kr1.name
      no   = ncloud_subnet.lb_kr1.id
      cidr = local.lb_kr1_cidr
    }
    private_kr1 = {
      name = ncloud_subnet.private_kr1.name
      no   = ncloud_subnet.private_kr1.id
      cidr = local.private_kr1_cidr
    }
    private_kr2 = {
      name = ncloud_subnet.private_kr2.name
      no   = ncloud_subnet.private_kr2.id
      cidr = local.private_kr2_cidr
    }
  }
}

output "server_ip_addresses" {
  description = "Public and private IP addresses"
  value = {
    bastion_public  = ncloud_public_ip.bastion.public_ip
    bastion_private = ncloud_network_interface.bastion.private_ip
    web_private     = ncloud_network_interface.web.private_ip
    backend_private = ncloud_network_interface.backend.private_ip
    db_private      = ncloud_network_interface.db.private_ip
  }
}

output "login_key_file" {
  description = "Login Key PEM used to decrypt Naver Cloud administrator passwords"
  value       = local_file.login_key_pem.filename
}

output "ssh_commands" {
  description = "Ready-to-run SSH commands"
  value = {
    bastion = "ssh root@${ncloud_public_ip.bastion.public_ip}"
    web     = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.web.private_ip}"
    backend = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.backend.private_ip}"
    db      = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.db.private_ip}"
  }
}

output "ssh_bastion_command" {
  description = "SSH command for the bastion server"
  value       = "ssh root@${ncloud_public_ip.bastion.public_ip}"
}

output "ssh_web_via_bastion_command" {
  description = "SSH command for the private web server"
  value       = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.web.private_ip}"
}

output "ssh_backend_via_bastion_command" {
  description = "SSH command for the private backend server"
  value       = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.backend.private_ip}"
}

output "ssh_db_via_bastion_command" {
  description = "SSH command for the private DB server"
  value       = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.db.private_ip}"
}

output "verification_commands" {
  description = "Commands to verify the board and each Init Script"
  value = {
    board         = "curl -i http://${ncloud_lb.web.domain}/api/health"
    web_init      = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.web.private_ip} 'sudo tail -n 100 ${local.init_log}'"
    backend_init  = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.backend.private_ip} 'sudo tail -n 100 ${local.init_log}'"
    database_init = "ssh -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.db.private_ip} 'sudo tail -n 100 ${local.init_log}'"
  }
}

output "admin_passwords" {
  description = "Decrypted server admin passwords for this disposable lab"
  value = {
    bastion = nonsensitive(data.ncloud_root_password.bastion.root_password)
    web     = nonsensitive(data.ncloud_root_password.web.root_password)
    backend = nonsensitive(data.ncloud_root_password.backend.root_password)
    db      = nonsensitive(data.ncloud_root_password.db.root_password)
  }
}

output "next_steps" {
  description = "What to do after terraform apply"
  value       = <<-EOT
1. Wait about 3-10 minutes for the Init Scripts to finish.
2. Check the board: curl -i http://${ncloud_lb.web.domain}/api/health
3. Open the board: http://${ncloud_lb.web.domain}/
4. If health is not 200, run: terraform output verification_commands
EOT
}
