variable "aws_region" {
  description = "Region name for the aws region"
  type        = string
  default     = "ap-southeast-2"
}

variable "instance_name" {
  description = "Value of the Name tag for the EC2 instance"
  type        = string
  default     = "satisfactory"
}

variable "key_pair" {
  description = "existing keypair to attach to server"
  type        = string
}

variable "time_zone" {
  description = "Time zone to set server to (TZ database name)"
  type        = string
  default     = "Etc/UTC"
}
