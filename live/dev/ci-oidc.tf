module "ci_oidc" {
  source = "../../modules/ci-oidc"
}

output "github_actions_role_arn" {
  value = module.ci_oidc.role_arn
}