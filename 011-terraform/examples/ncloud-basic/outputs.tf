output "vpc_no" {
  description = "Created VPC number"
  value       = ncloud_vpc.lab.id
}

output "public_subnet_no" {
  description = "Created public subnet number"
  value       = ncloud_subnet.public.id
}

output "private_subnet_no" {
  description = "Created private subnet number"
  value       = ncloud_subnet.private.id
}

output "nat_subnet_no" {
  description = "Created NAT Gateway subnet number"
  value       = ncloud_subnet.nat.id
}

output "nat_gateway_no" {
  description = "Created NAT Gateway number"
  value       = ncloud_nat_gateway.lab.id
}

output "bastion_server_instance_no" {
  description = "Created bastion server instance number"
  value       = ncloud_server.bastion.id
}

output "app_server_instance_no" {
  description = "Created app server instance number"
  value       = ncloud_server.app.id
}

output "db_server_instance_no" {
  description = "Created DB server instance number"
  value       = ncloud_server.db.id
}

output "bastion_public_ip" {
  description = "Bastion public IP address"
  value       = ncloud_public_ip.bastion.public_ip
}

output "app_public_ip" {
  description = "App public IP address"
  value       = ncloud_public_ip.app.public_ip
}

output "app_private_ip" {
  description = "App private IP address"
  value       = ncloud_network_interface.app.private_ip
}

output "db_private_ip" {
  description = "DB private IP address"
  value       = ncloud_network_interface.db.private_ip
}

output "http_url" {
  description = "Board web URL"
  value       = "http://${ncloud_public_ip.app.public_ip}/"
}

output "login_key_file" {
  description = "Generated login key PEM file path"
  value       = local_file.login_key_pem.filename
}

output "ssh_bastion_command" {
  description = "SSH command for the bastion server"
  value       = "ssh -i ${local_file.login_key_pem.filename} root@${ncloud_public_ip.bastion.public_ip}"
}

output "ssh_db_via_bastion_command" {
  description = "SSH command for the private DB server through bastion"
  value       = "ssh -i ${local_file.login_key_pem.filename} -J root@${ncloud_public_ip.bastion.public_ip} root@${ncloud_network_interface.db.private_ip}"
}

output "admin_passwords" {
  description = "Decrypted server admin passwords. Visible for lab convenience only."
  value = {
    bastion = nonsensitive(data.ncloud_root_password.bastion.root_password)
    app     = nonsensitive(data.ncloud_root_password.app.root_password)
    db      = nonsensitive(data.ncloud_root_password.db.root_password)
  }
}
