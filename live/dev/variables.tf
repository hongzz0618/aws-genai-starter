variable "project" {
  type    = string
  default = "aws-genai-starter"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "lambda_zip" {
  type    = string
  default = "../lambda.zip"
}

variable "env" {
  type    = string
  default = "dev"
}


variable "lambda_runtime" {
  type    = string
  default = "nodejs22.x"
}

variable "alarm_email" {
  description = "Optional email address for SNS alarm notifications. Leave empty to skip the email subscription."
  type        = string
  default     = ""
}

variable "tags" {
  type = map(string)
  default = {
    App    = "aws-genai-starter"
    Domain = "genai"
  }
}
