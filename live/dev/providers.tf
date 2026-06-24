terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.18"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Default state is local so this example can be initialized safely.
  # For remote state, use placeholder values from backend.hcl.example and
  # configure real bucket/table names outside the committed defaults.
  #
  # backend "s3" {
  #   bucket         = "example-terraform-state-bucket"
  #   key            = "aws-genai-starter/dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "example-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region
}
