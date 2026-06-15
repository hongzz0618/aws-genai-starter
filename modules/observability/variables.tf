variable "project" {
  description = "Project name."
  type        = string
}

variable "environment" {
  description = "Environment name."
  type        = string
}

variable "region" {
  description = "AWS region."
  type        = string
}

variable "tags" {
  description = "Common tags."
  type        = map(string)
  default     = {}
}

variable "lambda_function_names" {
  description = "Lambda function names to monitor."
  type        = list(string)
}

variable "api_gw_type" {
  description = "API Gateway type."
  type        = string
  default     = "http_v2"
}

variable "apigw_stage_name" {
  description = "API Gateway stage name."
  type        = string
}

variable "apigw_http_api_id" {
  description = "HTTP API ID."
  type        = string
  default     = ""
}

variable "apigw_rest_api_id" {
  description = "REST API ID."
  type        = string
  default     = ""
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name."
  type        = string
}

variable "log_retention_days" {
  description = "Log retention in days."
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Optional email address for SNS notifications. Leave empty to skip email subscription."
  type        = string
  default     = ""
}

variable "monthly_budget_amount" {
  description = "Monthly budget amount in the configured currency."
  type        = number
  default     = 25
}

variable "currency" {
  description = "Budget currency."
  type        = string
  default     = "USD"
}

variable "lambda_duration_p95_threshold_ms" {
  description = "Lambda p95 duration threshold in milliseconds."
  type        = number
  default     = 2000
}

variable "apigw_latency_p95_threshold_ms" {
  description = "API Gateway p95 latency threshold in milliseconds."
  type        = number
  default     = 1500
}

variable "enable_lambda_insights_layer" {
  type    = bool
  default = true
}

variable "throttling_rate_limit" {
  description = "Stage request rate limit."
  type        = number
  default     = 50
}

variable "throttling_burst_limit" {
  description = "Stage burst limit."
  type        = number
  default     = 100
}

variable "apigw_rest_deployment_id" {
  description = "Deployment ID for API Gateway REST v1 when this module manages the stage."
  type        = string
  default     = ""
}
