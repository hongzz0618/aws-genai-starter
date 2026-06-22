output "api_url" { value = module.api_http.invoke_url }
output "chat_table_name" { value = module.chat_table.table_name }
output "lambda_name" { value = module.lambda_api.function_name }
output "cognito_user_pool_id" { value = module.auth.user_pool_id }
output "cognito_user_pool_client_id" { value = module.auth.user_pool_client_id }
output "cognito_issuer" { value = module.auth.issuer }
