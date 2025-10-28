variable "name" { type = string }
variable "lambda_arn" { type = string }
variable "lambda_name" { type = string }
variable "routes" {
  type = map(string)
}
variable "tags" {
  type    = map(string)
  default = {}
}
