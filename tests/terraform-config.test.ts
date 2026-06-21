import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("terraform Bedrock IAM configuration", () => {
  const iamMain = readRepoFile("modules/iam_lambda_basic/main.tf");
  const iamVariables = readRepoFile("modules/iam_lambda_basic/variables.tf");
  const liveMain = readRepoFile("live/dev/main.tf");
  const liveVariables = readRepoFile("live/dev/variables.tf");
  const combined = [iamMain, iamVariables, liveMain, liveVariables].join("\n");

  it("does not retain broad Bedrock wildcard resources", () => {
    expect(combined).not.toContain("arn:aws:bedrock:*::foundation-model/*");
    expect(combined).not.toContain("arn:aws:bedrock:*:*:inference-profile/*");
    expect(combined).not.toContain("arn:aws:bedrock:*:*:application-inference-profile/*");
    expect(iamMain).not.toMatch(/Resource\s*=\s*"\*"/);
  });

  it("grants only the Bedrock action used by the current Converse path", () => {
    expect(iamMain).toContain('Action   = ["bedrock:InvokeModel"]');
    expect(iamMain).not.toContain("bedrock:InvokeModelWithResponseStream");
  });

  it("requires exact Bedrock resource ARNs without wildcard fallback", () => {
    expect(iamVariables).toContain("bedrock_inference_profile_arns");
    expect(iamVariables).toContain("bedrock_foundation_model_arns");
    expect(iamVariables).toContain("without wildcards");
    expect(iamMain).toContain("at least one exact Bedrock resource ARN");
  });

  it("wires MODEL_ID to matching Bedrock IAM inputs in the dev root", () => {
    expect(liveMain).toMatch(/bedrock_model_id\s*=\s*var\.bedrock_model_id/);
    expect(liveMain).toContain("bedrock_inference_profile_arn");
    expect(liveMain).toContain("bedrock_foundation_model_arns");
    expect(liveMain).toContain("bedrock_inference_profile_arns");
    expect(liveMain).toContain("MODEL_ID      = local.bedrock_model_id");
    expect(liveVariables).toContain('default     = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"');
  });
});
