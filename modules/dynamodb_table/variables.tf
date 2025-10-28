variable "name" { type = string }
variable "hash_key" { type = string }
variable "range_key" { type = string }
variable "billing_mode" {
  type    = string
  default = "PAY_PER_REQUEST"
}
variable "ttl_attribute" {
  type    = string
  default = ""
}
variable "tags" {
  type    = map(string)
  default = {}
}
