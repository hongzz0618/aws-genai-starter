locals {
  name_prefix = "${var.project}-${var.env}"
  chat_table  = "chat_history-${var.env}"
  lambda_fn   = "api-${var.env}"
}

# 1) IAM básico para Lambda
module "iam_lambda" {
  source         = "../../modules/iam_lambda_basic"
  name           = "${local.name_prefix}-lambda"
  enable_bedrock = true
  tags           = var.tags
}

# 2) DynamoDB - historial de chat
module "chat_table" {
  source       = "../../modules/dynamodb_table"
  name         = local.chat_table
  hash_key     = "session_id"
  range_key    = "timestamp"
  billing_mode = "PAY_PER_REQUEST"
  tags         = var.tags
}

# 3) Policy mínima para que Lambda acceda a la tabla
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

# 4) Lambda (zip empaquetado en build/lambda.zip)
module "lambda_api" {
  source             = "../../modules/lambda_function"
  function_name      = "${var.project}-${local.lambda_fn}"
  role_arn           = module.iam_lambda.role_arn
  runtime            = var.lambda_runtime
  handler            = "app.handler"
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

# 5) API Gateway HTTP v2 con rutas /health y /chat
module "api_http" {
  source      = "../../modules/api_http"
  name        = "${local.name_prefix}-http"
  lambda_arn  = module.lambda_api.lambda_invoke_arn
  lambda_name = module.lambda_api.function_name
  routes = {
    "GET /health" = "default"
    "POST /chat"  = "default"
  }
  tags = var.tags
}
