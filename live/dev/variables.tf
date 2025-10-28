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
  default = "python3.12"
}

variable "tags" {
  type = map(string)
  default = {
    App    = "aws-genai-starter"
    Domain = "genai"
  }
}
