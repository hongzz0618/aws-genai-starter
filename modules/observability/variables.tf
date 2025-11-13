variable "project" {
  description = "Nombre del proyecto"
  type        = string
}

variable "environment" {
  description = "Entorno (dev|prod)"
  type        = string
}

variable "region" {
  description = "Región AWS"
  type        = string
}

variable "tags" {
  description = "Etiquetas comunes"
  type        = map(string)
  default     = {}
}

variable "lambda_function_names" {
  description = "Lista de nombres de funciones Lambda"
  type        = list(string)
}

variable "api_gw_type" {
  description = "Tipo de API Gateway"
  type        = string
  default     = "http_v2"
}

variable "apigw_stage_name" {
  description = "Nombre del stage"
  type        = string
}

variable "apigw_http_api_id" {
  description = "ID de la API HTTP"
  type        = string
  default     = ""
}

variable "apigw_rest_api_id" {
  description = "ID de la API REST"
  type        = string
  default     = ""
}

variable "dynamodb_table_name" {
  description = "Nombre de la tabla DynamoDB"
  type        = string
}

variable "log_retention_days" {
  description = "Retención de logs en días"
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Email para notificaciones (SNS subscription)"
  type        = string
}

variable "monthly_budget_amount" {
  description = "Presupuesto mensual en la moneda de la cuenta"
  type        = number
  default     = 25
}

variable "currency" {
  description = "Moneda del presupuesto"
  type        = string
  default     = "USD"
}

variable "lambda_duration_p95_threshold_ms" {
  description = "Umbral p95 de duración de Lambda en ms"
  type        = number
  default     = 2000
}

variable "apigw_latency_p95_threshold_ms" {
  description = "Umbral p95 de Latency del API Gateway en ms"
  type        = number
  default     = 1500
}

variable "enable_lambda_insights_layer" {
  type        = bool
  default     = true
}

variable "throttling_rate_limit" {
  description = "Límite de peticiones por segundo en el stage"
  type        = number
  default     = 50
}

variable "throttling_burst_limit" {
  description = "Límite burst en el stage"
  type        = number
  default     = 100
}

variable "apigw_rest_deployment_id" {
  description = "Deployment ID para API Gateway REST (v1); requerido si api_gw_type == rest_v1 y el módulo gestiona el stage."
  type        = string
  default     = ""
}
