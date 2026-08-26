variable "access_key" {
  description = "Naver Cloud API access key"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "Naver Cloud API secret key"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Naver Cloud region code"
  type        = string
  default     = "KR"
}

variable "zone" {
  description = "Naver Cloud zone code"
  type        = string
  default     = "KR-1"
}

variable "my_public_ip" {
  description = "Allowed source CIDR for SSH. Example: 203.0.113.10/32"
  type        = string
}

variable "name_prefix" {
  description = "Name prefix for lab resources. Change this value if the default names already exist."
  type        = string
  default     = "lab11"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.name_prefix))
    error_message = "name_prefix must start with a lowercase letter and contain 3-21 lowercase letters, numbers, or hyphens."
  }
}

variable "server_image_number" {
  description = "Ubuntu G3/KVM server image number"
  type        = string
  default     = "104630229"
}

variable "server_spec_code" {
  description = "G3/KVM server spec code"
  type        = string
  default     = "s2-g3a"
}

variable "db_root_password" {
  description = "MariaDB root password for the board database server"
  type        = string
  sensitive   = true
  default     = "ChangeRootPassword123!"
}

variable "board_db_password" {
  description = "Application database user password for the board example"
  type        = string
  sensitive   = true
  default     = "ChangeThisPassword123!"
}
