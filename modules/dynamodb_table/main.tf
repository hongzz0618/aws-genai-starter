resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = var.billing_mode

  hash_key  = var.hash_key
  range_key = var.range_key

  attribute {
    name = var.hash_key
    type = "S"
  }
  attribute {
    name = var.range_key
    type = "N"
  }

  dynamic "ttl" {
    for_each = var.ttl_attribute != "" ? [1] : []
    content {
      attribute_name = var.ttl_attribute
      enabled        = true
    }
  }

  tags = var.tags
}
