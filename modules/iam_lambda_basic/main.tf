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

resource "aws_iam_policy" "bedrock_invoke" {
  count       = var.enable_bedrock ? 1 : 0
  name        = "${var.name}-bedrock-invoke"
  description = "Allow Lambda to invoke Bedrock models"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "attach_bedrock" {
  count      = var.enable_bedrock ? 1 : 0
  role       = aws_iam_role.this.name
  policy_arn = aws_iam_policy.bedrock_invoke[0].arn
}
