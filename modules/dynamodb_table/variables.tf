variable "name" { type = string }
variable "hash_key" { type = string }
variable "range_key" { type = string }
variable "hash_key_type" {
  type    = string
  default = "S"

  validation {
    condition     = contains(["S", "N", "B"], var.hash_key_type)
    error_message = "hash_key_type must be one of S, N, or B."
  }
}
variable "range_key_type" {
  type    = string
  default = "S"

  validation {
    condition     = contains(["S", "N", "B"], var.range_key_type)
    error_message = "range_key_type must be one of S, N, or B."
  }
}
variable "billing_mode" {
  type    = string
  default = "PAY_PER_REQUEST"
}
variable "ttl_attribute" {
  type    = string
  default = ""

  validation {
    condition     = var.ttl_attribute == "" || can(regex("^[A-Za-z0-9_.-]+$", var.ttl_attribute))
    error_message = "ttl_attribute must be empty or a concrete DynamoDB attribute name."
  }
}
variable "tags" {
  type    = map(string)
  default = {}
}
