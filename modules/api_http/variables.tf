variable "name" { type = string }
variable "lambda_arn" { type = string }
variable "lambda_name" { type = string }
variable "routes" {
  type = map(string)
}
variable "cors_allow_origins" {
  type        = list(string)
  description = "Origins allowed by HTTP API native CORS."
  default     = ["*"]
}
variable "cors_allow_methods" {
  type        = list(string)
  description = "Methods allowed by HTTP API native CORS."
  default     = ["GET", "POST", "OPTIONS"]
}
variable "cors_allow_headers" {
  type        = list(string)
  description = "Headers allowed by HTTP API native CORS."
  default     = ["Content-Type"]
}
variable "cors_max_age" {
  type        = number
  description = "Browser preflight cache duration in seconds."
  default     = 300
}
variable "tags" {
  type    = map(string)
  default = {}
}
