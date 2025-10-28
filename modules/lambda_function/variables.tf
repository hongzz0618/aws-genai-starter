variable "function_name" { type = string }
variable "role_arn" { type = string }
variable "runtime" { type = string }
variable "handler" { type = string }
variable "zip_path" { type = string }
variable "memory_size" {
  type    = number
  default = 256
}
variable "timeout_seconds" {
  type    = number
  default = 15
}
variable "architecture" {
  type    = string
  default = "arm64"
}
variable "environment" {
  type    = map(string)
  default = {}
}
variable "log_retention_days" {
  type    = number
  default = 14
}
variable "tags" {
  type    = map(string)
  default = {}
}
