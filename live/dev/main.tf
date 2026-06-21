locals {
  name_prefix = "${var.project}-${var.env}"
  chat_table  = "chat_history-${var.env}"
  lambda_fn   = "api-${var.env}"
}

# 1) IAM role for Lambda
module "iam_lambda" {
  source         = "../../modules/iam_lambda_basic"
  name           = "${local.name_prefix}-lambda"
  enable_bedrock = true
  tags           = var.tags
}

# 2) DynamoDB chat history table
module "chat_table" {
  source       = "../../modules/dynamodb_table"
  name         = local.chat_table
  hash_key     = "session_id"
  range_key    = "timestamp"
  billing_mode = "PAY_PER_REQUEST"
  tags         = var.tags
}

# 3) Scoped policy for Lambda access to the table
resource "aws_iam_policy" "lambda_dynamodb" {
  name        = "${local.name_prefix}-lambda-dynamodb"
  description = "Lambda access to chat history DynamoDB"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid    = "ChatTableRW",
      Effect = "Allow",
      Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:BatchWriteItem"],
      Resource = [
        module.chat_table.table_arn,
        "${module.chat_table.table_arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "attach_ddb" {
  role       = module.iam_lambda.role_name
  policy_arn = aws_iam_policy.lambda_dynamodb.arn
}

# 4) Lambda (TypeScript build packaged in build/lambda.zip)
module "lambda_api" {
  source             = "../../modules/lambda_function"
  function_name      = "${var.project}-${local.lambda_fn}"
  role_arn           = module.iam_lambda.role_arn
  runtime            = var.lambda_runtime
  handler            = "handler.handler"
  zip_path           = "${path.module}/../../build/lambda.zip"
  memory_size        = 256
  timeout_seconds    = 15
  log_retention_days = 14
  environment = {
    CHAT_TABLE    = module.chat_table.table_name
    MODEL_ID      = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
    HISTORY_TURNS = "10"
    TEMPERATURE   = "0.2"
    MAX_TOKENS    = "1024"
  }
  tags = var.tags
}

# 5) API Gateway HTTP v2 routes for /health and /chat
module "api_http" {
  source             = "../../modules/api_http"
  name               = "${local.name_prefix}-http"
  lambda_arn         = module.lambda_api.lambda_invoke_arn
  lambda_name        = module.lambda_api.function_name
  cors_allow_origins = ["*"]
  cors_allow_methods = ["GET", "POST", "OPTIONS"]
  cors_allow_headers = ["Content-Type"]
  routes = {
    "GET /health" = "default"
    "POST /chat"  = "default"
  }
  tags = var.tags
}

module "observability" {
  source      = "../../modules/observability"
  project     = var.project
  environment = var.env
  region      = var.region

  tags = {
    Owner = var.project
  }

  lambda_function_names = [
    module.lambda_api.function_name
  ]
  lambda_log_group_names = {
    (module.lambda_api.function_name) = module.lambda_api.log_group_name
  }

  api_gw_type       = "http_v2"
  apigw_http_api_id = module.api_http.api_id
  apigw_stage_name  = module.api_http.stage_name

  dynamodb_table_name = module.chat_table.table_name

  alarm_email = var.alarm_email

  monthly_budget_amount            = 25
  currency                         = "USD"
  lambda_duration_p95_threshold_ms = 2000
  apigw_latency_p95_threshold_ms   = 1500
}
