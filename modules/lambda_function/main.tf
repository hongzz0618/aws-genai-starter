locals {
  arch = var.architecture == "x86_64" ? "x86_64" : "arm64"
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = var.role_arn
  runtime       = var.runtime
  handler       = var.handler
  filename      = var.zip_path
  memory_size   = var.memory_size
  timeout       = var.timeout_seconds
  architectures = [local.arch]

  # Recalcula el deploy si cambia el zip
  source_code_hash = filebase64sha256(var.zip_path)

  environment {
    variables = var.environment
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${aws_lambda_function.this.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}
