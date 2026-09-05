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

variable "zone_kr1" {
  description = "Primary availability zone"
  type        = string
  default     = "KR-1"
}

variable "zone_kr2" {
  description = "Secondary availability zone"
  type        = string
  default     = "KR-2"
}

variable "my_public_ip" {
  description = "Allowed source CIDR for SSH. Example: 203.0.113.10/32"
  type        = string

  validation {
    condition     = can(cidrhost(var.my_public_ip, 0))
    error_message = "my_public_ip must be a valid CIDR such as 203.0.113.10/32."
  }
}

variable "name_prefix" {
  description = "Name prefix for lab resources"
  type        = string
  default     = "lab7"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,10}$", var.name_prefix))
    error_message = "name_prefix must contain 3-11 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "server_image_number" {
  description = "Ubuntu G3/KVM server image number available in the account"
  type        = string
  default     = "104630229"
}

variable "server_spec_code" {
  description = "G3/KVM server spec code"
  type        = string
  default     = "s2-g3a"
}

variable "db_root_password" {
  description = "MariaDB root password for the board DB server"
  type        = string
  sensitive   = true
  default     = "ChangeRootPass123!"

  validation {
    condition     = length(var.db_root_password) >= 8 && length(var.db_root_password) <= 20
    error_message = "db_root_password must be 8-20 characters."
  }
}

variable "board_db_password" {
  description = "Password for the board_app database user"
  type        = string
  sensitive   = true
  default     = "ChangeBoardPass123!"

  validation {
    condition     = length(var.board_db_password) >= 8 && length(var.board_db_password) <= 20
    error_message = "board_db_password must be 8-20 characters."
  }
}
