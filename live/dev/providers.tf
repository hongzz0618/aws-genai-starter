terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.18"
    }
  }
  
    backend "s3" {
    bucket         = "tfstate-acme-dev-us-east-1"
    key            = "genai/dev/app.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tfstate-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
}
