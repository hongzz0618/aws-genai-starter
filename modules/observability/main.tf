locals {
  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
    },
    var.tags
  )

  apigw_metric_api_identifier = var.api_gw_type == "http_v2" ? var.apigw_http_api_id : coalesce(var.apigw_api_name, var.project)
  apigw_5xx_metric_name       = var.api_gw_type == "http_v2" ? "5xx" : "5XXError"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

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
  for_each       = var.lambda_log_group_names
  name           = "LambdaErrorFilter-${each.key}"
  log_group_name = each.value
  pattern        = "\"chat_request_failed\""

  metric_transformation {
    name      = "LambdaErrorCount_${each.key}"
    namespace = "Custom/Lambda"
    value     = "1"
  }
}

# SNS notifications
resource "aws_sns_topic" "alerts" {
  name = "${var.project}-${var.environment}-alerts"
  tags = local.common_tags
}

data "aws_iam_policy_document" "alerts_publish" {
  statement {
    sid     = "AllowCloudWatchAlarmPublishing"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:${data.aws_partition.current.partition}:cloudwatch:${var.region}:${data.aws_caller_identity.current.account_id}:alarm:*"
      ]
    }
  }

  statement {
    sid     = "AllowBudgetsPublishing"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:${data.aws_partition.current.partition}:budgets::${data.aws_caller_identity.current.account_id}:*"
      ]
    }
  }

  statement {
    sid     = "AllowCostAnomalyDetectionPublishing"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }

    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts_publish" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_publish.json
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Lambda alarms for errors and p95 duration
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each            = aws_cloudwatch_log_metric_filter.lambda_error_filter
  alarm_name          = "${each.key}-Errors-Alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "LambdaErrorCount_${each.key}"
  namespace           = "Custom/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Errors detected in ${each.key}"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = local.common_tags

  depends_on = [aws_sns_topic_policy.alerts_publish]
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

  alarm_description = "High p95 duration for ${each.value}"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags

  depends_on = [aws_sns_topic_policy.alerts_publish]
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each            = toset(var.lambda_function_names)
  alarm_name          = "${each.value}-Throttles-High"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    FunctionName = each.value
  }

  alarm_description = "Lambda throttles for ${each.value}"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]
  tags              = local.common_tags

  depends_on = [aws_sns_topic_policy.alerts_publish]
}

resource "aws_cloudwatch_metric_alarm" "bedrock_throttles" {
  alarm_name          = "${var.project}-${var.environment}-BedrockThrottle-High"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "BedrockThrottleCount"
  namespace           = var.metric_service_name
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    Service     = var.metric_service_name
    Environment = var.environment
  }

  alarm_description = "Bedrock retryable throttle or availability failures"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]
  tags              = local.common_tags

  depends_on = [aws_sns_topic_policy.alerts_publish]
}

# API Gateway 5XX and p95 latency
resource "aws_cloudwatch_metric_alarm" "apigw_5xx" {
  alarm_name          = "${var.project}-${var.environment}-APIGW-5XX-High"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = local.apigw_5xx_metric_name
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 1

  dimensions = var.api_gw_type == "http_v2" ? {
    ApiId = local.apigw_metric_api_identifier
    Stage = var.apigw_stage_name
    } : {
    ApiName = local.apigw_metric_api_identifier
    Stage   = var.apigw_stage_name
  }

  alarm_description = "API Gateway 5XX errors"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags

  depends_on = [aws_sns_topic_policy.alerts_publish]
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
    ApiId = local.apigw_metric_api_identifier
    Stage = var.apigw_stage_name
    } : {
    ApiName = local.apigw_metric_api_identifier
    Stage   = var.apigw_stage_name
  }

  alarm_description = "High API Gateway p95 latency"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  ok_actions        = [aws_sns_topic.alerts.arn]

  tags = local.common_tags

  depends_on = [aws_sns_topic_policy.alerts_publish]
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

  depends_on = [aws_sns_topic_policy.alerts_publish]
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

  depends_on = [aws_sns_topic_policy.alerts_publish]
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
              ["AWS/ApiGateway", local.apigw_5xx_metric_name, var.api_gw_type == "http_v2" ? "ApiId" : "ApiName", local.apigw_metric_api_identifier, "Stage", var.apigw_stage_name, { "stat" : "Sum" }],
              [".", "Latency", var.api_gw_type == "http_v2" ? "ApiId" : "ApiName", local.apigw_metric_api_identifier, "Stage", var.apigw_stage_name, { "stat" : "p95" }]
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
              ["Custom/Lambda", "LambdaErrorCount_${fn}", { "stat" : "Sum" }]
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

  depends_on = [aws_sns_topic_policy.alerts_publish]
}

# Cost Anomaly Detection
resource "aws_ce_anomaly_monitor" "service" {
  count = var.enable_cost_anomaly_detection ? 1 : 0

  name              = "${var.project}-${var.environment}-service-anomaly-monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "service_subscription" {
  count = var.enable_cost_anomaly_detection ? 1 : 0

  name             = "${var.project}-${var.environment}-service-anomaly-sub"
  frequency        = "IMMEDIATE"
  monitor_arn_list = [aws_ce_anomaly_monitor.service[0].arn]

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["5"]
    }
  }

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.alerts.arn
  }

  depends_on = [aws_sns_topic_policy.alerts_publish]
}
