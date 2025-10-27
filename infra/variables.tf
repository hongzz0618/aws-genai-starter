variable "name" {
  type    = string
  default = "aws-genai-starter"
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "lambda_zip" {
  type    = string
  default = "../lambda.zip"
}
