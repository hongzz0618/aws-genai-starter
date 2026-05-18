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

variable "bedrock_model_resource_arns" {
  type = list(string)
  default = [
    "arn:aws:bedrock:*::foundation-model/*",
    "arn:aws:bedrock:*:*:inference-profile/*"
  ]
  description = "Bedrock model or inference-profile ARNs the Lambda may invoke. Replace the defaults with exact regional model ARNs for production."

  validation {
    condition     = length(var.bedrock_model_resource_arns) > 0
    error_message = "bedrock_model_resource_arns must include at least one Bedrock model or inference-profile ARN."
  }
}
