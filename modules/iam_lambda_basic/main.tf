resource "aws_iam_role" "this" {
  name = "${var.name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic_logs" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

locals {
  bedrock_inference_profile_arns = distinct(var.bedrock_inference_profile_arns)
  bedrock_foundation_model_arns  = distinct(var.bedrock_foundation_model_arns)
  bedrock_allowed_resource_arns  = concat(local.bedrock_inference_profile_arns, local.bedrock_foundation_model_arns)

  bedrock_inference_profile_statements = length(local.bedrock_inference_profile_arns) == 0 ? [] : [
    {
      Sid      = "InvokeConfiguredInferenceProfile"
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = local.bedrock_inference_profile_arns
    }
  ]

  bedrock_foundation_model_statements = length(local.bedrock_foundation_model_arns) == 0 ? [] : [
    merge(
      {
        Sid      = length(local.bedrock_inference_profile_arns) == 0 ? "InvokeConfiguredFoundationModels" : "InvokeProfileDestinationModels"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = local.bedrock_foundation_model_arns
      },
      length(local.bedrock_inference_profile_arns) == 0 ? {} : {
        Condition = {
          StringLike = {
            "bedrock:InferenceProfileArn" = local.bedrock_inference_profile_arns
          }
        }
      }
    )
  ]
}

resource "aws_iam_policy" "bedrock_invoke" {
  count       = var.enable_bedrock ? 1 : 0
  name        = "${var.name}-bedrock-invoke"
  description = "Allow Lambda to invoke Bedrock models"
  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = concat(local.bedrock_inference_profile_statements, local.bedrock_foundation_model_statements)
  })

  lifecycle {
    precondition {
      condition     = length(local.bedrock_allowed_resource_arns) > 0
      error_message = "Bedrock is enabled, so at least one exact Bedrock resource ARN must be configured."
    }

    precondition {
      condition     = length(local.bedrock_inference_profile_arns) == 0 || length(local.bedrock_foundation_model_arns) > 0
      error_message = "Inference profile access must also include exact foundation-model ARNs for the destination models."
    }
  }
}

resource "aws_iam_role_policy_attachment" "attach_bedrock" {
  count      = var.enable_bedrock ? 1 : 0
  role       = aws_iam_role.this.name
  policy_arn = aws_iam_policy.bedrock_invoke[0].arn
}
