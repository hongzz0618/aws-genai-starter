variable "project" {
  description = "Project name."
  type        = string
}

variable "environment" {
  description = "Environment name."
  type        = string
}

variable "metric_service_name" {
  description = "Service dimension value emitted by application EMF metrics."
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

variable "lambda_log_group_names" {
  description = "Lambda CloudWatch log group names keyed by Lambda function name."
  type        = map(string)
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

variable "apigw_api_name" {
  description = "API Gateway API name for REST API metrics."
  type        = string
  default     = null
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name."
  type        = string
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
