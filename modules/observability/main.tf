locals {
  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
    },
    var.tags
  )
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# -----------------------------
# CloudWatch Log Groups (Lambda + API)
# -----------------------------
resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = toset(var.lambda_function_names)
  name              = "/aws/lambda/${each.value}"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# Access logs para API Gateway (HTTP API v2)
resource "aws_cloudwatch_log_group" "apigw_access" {
  count             = var.api_gw_type == "http_v2" ? 1 : 0
  name              = "/aws/apigw/${var.project}-${var.environment}-${var.apigw_stage_name}"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# Access logs para API Gateway (REST v1)
resource "aws_cloudwatch_log_group" "apigw_rest_access" {
  count             = var.api_gw_type == "rest_v1" ? 1 : 0
  name              = "/aws/apigw-rest/${var.project}-${var.environment}-${var.apigw_stage_name}"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# -----------------------------
# API Gateway Stage Logging + Throttling
# -----------------------------

# HTTP API (apigatewayv2)
resource "aws_apigatewayv2_stage" "http_stage" {
  count       = var.api_gw_type == "http_v2" ? 1 : 0
  api_id      = var.apigw_http_api_id
  name        = var.apigw_stage_name
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_access[0].arn
    format = jsonencode({
      requestId         = "$context.requestId"
      requestTime       = "$context.requestTime"
      httpMethod        = "$context.httpMethod"
      path              = "$context.path"
      status            = "$context.status"
      protocol          = "$context.protocol"
      responseLength    = "$context.responseLength"
      integrationError  = "$context.integrationErrorMessage"
      integrationStatus = "$context.integrationStatus"
      errorMessage      = "$context.error.message"
      authorizerError   = "$context.authorizer.error"
      ip                = "$context.identity.sourceIp"
      userAgent         = "$context.identity.userAgent"
      latency           = "$context.responseLatency"
    })
  }

  # Throttling por stage
  default_route_settings {
    throttling_rate_limit    = var.throttling_rate_limit
    throttling_burst_limit   = var.throttling_burst_limit
    detailed_metrics_enabled = true
  }

  tags = local.common_tags
}

# REST API (v1)
resource "aws_api_gateway_stage" "rest_stage" {
  count         = var.api_gw_type == "rest_v1" && length(var.apigw_rest_deployment_id) > 0 ? 1 : 0
  rest_api_id   = var.apigw_rest_api_id
  stage_name    = var.apigw_stage_name
  deployment_id = var.apigw_rest_deployment_id

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_rest_access[0].arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      caller           = "$context.identity.caller"
      user             = "$context.identity.user"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      resourcePath     = "$context.resourcePath"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      errorMessage     = "$context.error.message"
      integrationError = "$context.integrationErrorMessage"
      latency          = "$context.responseLatency"
    })
  }

  xray_tracing_enabled = true

  tags = local.common_tags
}

# -----------------------------
# DynamoDB - Contributor Insights
# -----------------------------
resource "aws_dynamodb_contributor_insights" "table" {
  table_name = var.dynamodb_table_name
}

# -----------------------------
# Metric Filters + Alarms (Lambda Errors via Logs)
# -----------------------------
resource "aws_cloudwatch_log_metric_filter" "lambda_error_filter" {
  for_each       = aws_cloudwatch_log_group.lambda
  name           = "LambdaErrorFilter-${each.key}"
  log_group_name = each.value.name
  pattern        = "?ERROR ?Error ?Exception ?Traceback"

  metric_transformation {
    name      = "LambdaErrorCount"
    namespace = "Custom/Lambda"
    value     = "1"
    dimensions = {
      FunctionName = each.key
    }
  }
}

# SNS para notificaciones
resource "aws_sns_topic" "alerts" {
  name = "${var.project}-${var.environment}-alerts"
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Alarmas por función: errores (desde métrica custom) y duración p95
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each            = aws_cloudwatch_log_metric_filter.lambda_error_filter
  alarm_name          = "${each.key}-Errors-Alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "LambdaErrorCount"
  namespace           = "Custom/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    FunctionName = each.key
  }

  alarm_description = "Errores detectados en ${each.key}"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration_p95" {
  for_each            = toset(var.lambda_function_names)
  alarm_name          = "${each.value}-DurationP95-High"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 60
  extended_statistic  = "p95"
  threshold           = var.lambda_duration_p95_threshold_ms

  dimensions = {
    FunctionName = each.value
  }

  alarm_description = "p95 de duración alto en ${each.value}"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

# API Gateway - 5XX y Latency p95
resource "aws_cloudwatch_metric_alarm" "apigw_5xx" {
  alarm_name          = "${var.project}-${var.environment}-APIGW-5XX-High"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = var.api_gw_type == "http_v2" ? {
    ApiId = var.apigw_http_api_id
    Stage = var.apigw_stage_name
    } : {
    ApiName = var.project
    Stage   = var.apigw_stage_name
  }

  alarm_description = "Errores 5XX en API Gateway"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "apigw_latency_p95" {
  alarm_name          = "${var.project}-${var.environment}-APIGW-LatencyP95-High"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Latency"
  namespace           = "AWS/ApiGateway"
  period              = 60
  extended_statistic  = "p95"
  threshold           = var.apigw_latency_p95_threshold_ms

  dimensions = var.api_gw_type == "http_v2" ? {
    ApiId = var.apigw_http_api_id
    Stage = var.apigw_stage_name
    } : {
    ApiName = var.project
    Stage   = var.apigw_stage_name
  }

  alarm_description = "Latencia p95 alta en API Gateway"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

# DynamoDB - Throttle alarms
resource "aws_cloudwatch_metric_alarm" "ddb_read_throttle" {
  alarm_name          = "${var.dynamodb_table_name}-ReadThrottle"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    TableName = var.dynamodb_table_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ddb_write_throttle" {
  alarm_name          = "${var.dynamodb_table_name}-WriteThrottle"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "WriteThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    TableName = var.dynamodb_table_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# -----------------------------
# CloudWatch Dashboard
# -----------------------------
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project}-${var.environment}-dashboard"

  dashboard_body = jsonencode({
    widgets = concat(
      [
        {
          "type" : "text",
          "width" : 24,
          "height" : 1,
          "properties" : {
            "markdown" : "# ${var.project} (${var.environment}) - Observability"
          }
        },
        {
          "type" : "metric",
          "width" : 12,
          "height" : 6,
          "properties" : {
            "title" : "API Gateway - 5XX / Latency",
            "metrics" : [
              ["AWS/ApiGateway", "5xx", var.api_gw_type == "http_v2" ? "ApiId" : "ApiName", var.api_gw_type == "http_v2" ? var.apigw_http_api_id : var.project, "Stage", var.apigw_stage_name, { "stat" : "Sum" }],
              [".", "Latency", var.api_gw_type == "http_v2" ? "ApiId" : "ApiName", var.api_gw_type == "http_v2" ? var.apigw_http_api_id : var.project, "Stage", var.apigw_stage_name, { "stat" : "p95" }]
            ],
            "region" : var.region,
            "view" : "timeSeries",
            "stacked" : false
          }
        },
        {
          "type" : "metric",
          "width" : 12,
          "height" : 6,
          "properties" : {
            "title" : "DynamoDB - Throttles",
            "metrics" : [
              ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", var.dynamodb_table_name, { "stat" : "Sum" }],
              [".", "WriteThrottleEvents", "TableName", var.dynamodb_table_name, { "stat" : "Sum" }]
            ],
            "region" : var.region,
            "view" : "timeSeries",
            "stacked" : false
          }
        }
      ],
      # Lambdas - invocations/ errors/ duration
      [
        for fn in var.lambda_function_names : {
          "type" : "metric",
          "width" : 8,
          "height" : 6,
          "properties" : {
            "title" : "Lambda ${fn}",
            "metrics" : [
              ["AWS/Lambda", "Invocations", "FunctionName", fn, { "stat" : "Sum" }],
              [".", "Errors", "FunctionName", fn, { "stat" : "Sum" }],
              [".", "Duration", "FunctionName", fn, { "stat" : "p95" }],
              ["Custom/Lambda", "LambdaErrorCount", "FunctionName", fn, { "stat" : "Sum" }]
            ],
            "region" : var.region,
            "view" : "timeSeries",
            "stacked" : false
          }
        }
      ]
    )
  })
}

# -----------------------------
# Budgets + Cost Anomaly Detection
# -----------------------------
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-${var.environment}-monthly-budget"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = tostring(var.monthly_budget_amount)
  limit_unit   = var.currency

  cost_types {
    include_tax    = true
    include_credit = false
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  tags = local.common_tags
}

# Cost Anomaly Detection
resource "aws_ce_anomaly_monitor" "service" {
  name              = "${var.project}-${var.environment}-service-anomaly-monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "service_subscription" {
  name             = "${var.project}-${var.environment}-service-anomaly-sub"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.service.arn]

  threshold_expression {
    or {
      dimension {
        key    = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
        values = ["5"]
      }
      dimension {
        key    = "ANOMALY_TOTAL_IMPACT_PERCENTAGE"
        values = ["40"]
      }
    }
  }

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.alerts.arn
  }
}
