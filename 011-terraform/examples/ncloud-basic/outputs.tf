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

output "server_instance_no" {
  description = "Created server instance number"
  value       = ncloud_server.web.id
}

output "public_ip" {
  description = "Public IP address"
  value       = ncloud_public_ip.web.public_ip
}

output "login_key_file" {
  description = "Generated login key PEM file path"
  value       = local_file.login_key_pem.filename
}
