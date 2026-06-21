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

variable "bedrock_model_id" {
  description = "System-defined Bedrock inference profile ID used by the Lambda MODEL_ID environment variable."
  type        = string
  default     = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"

  validation {
    condition     = length(trimspace(var.bedrock_model_id)) > 0 && !can(regex("\\*", var.bedrock_model_id)) && !can(regex("^arn:", var.bedrock_model_id))
    error_message = "bedrock_model_id must be a non-empty inference profile ID, not an ARN or wildcard."
  }
}

variable "bedrock_foundation_model_id" {
  description = "Foundation model ID that backs the configured Bedrock inference profile."
  type        = string
  default     = "anthropic.claude-3-5-sonnet-20241022-v2:0"

  validation {
    condition     = length(trimspace(var.bedrock_foundation_model_id)) > 0 && !can(regex("\\*", var.bedrock_foundation_model_id)) && !can(regex("^arn:", var.bedrock_foundation_model_id))
    error_message = "bedrock_foundation_model_id must be a non-empty foundation model ID, not an ARN or wildcard."
  }
}

variable "bedrock_inference_profile_destination_regions" {
  description = "Destination Regions for the configured system-defined Bedrock inference profile."
  type        = list(string)
  default     = ["us-east-1", "us-east-2", "us-west-2"]

  validation {
    condition = length(var.bedrock_inference_profile_destination_regions) > 0 && alltrue([
      for region in var.bedrock_inference_profile_destination_regions :
      can(regex("^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$", region))
    ])
    error_message = "bedrock_inference_profile_destination_regions must contain one or more concrete AWS Region names."
  }
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
