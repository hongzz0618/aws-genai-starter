variable "name" {
  type = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "enable_bedrock" {
  type    = bool
  default = false
}
