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

variable "bedrock_inference_profile_arns" {
  type        = list(string)
  default     = []
  description = "Exact Bedrock inference-profile or application-inference-profile ARNs the Lambda may invoke."

  validation {
    condition = alltrue([
      for arn in var.bedrock_inference_profile_arns :
      can(regex("^arn:[^:]+:bedrock:[^:*]+:[0-9]{12}:(inference-profile|application-inference-profile)/[^*]+$", arn))
    ])
    error_message = "bedrock_inference_profile_arns must contain exact Bedrock inference-profile or application-inference-profile ARNs without wildcards."
  }
}

variable "bedrock_foundation_model_arns" {
  type        = list(string)
  default     = []
  description = "Exact Bedrock foundation-model ARNs the Lambda may invoke directly or through the configured inference profile."

  validation {
    condition = alltrue([
      for arn in var.bedrock_foundation_model_arns :
      can(regex("^arn:[^:]+:bedrock:[^:*]*::foundation-model/[^*]+$", arn))
    ])
    error_message = "bedrock_foundation_model_arns must contain exact Bedrock foundation-model ARNs without wildcards."
  }
}
