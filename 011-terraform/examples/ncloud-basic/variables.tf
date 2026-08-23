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
