export const SERVICE_NAME = "aws-genai-starter";

export interface AppConfig {
  chatTable?: string;
  awsRegion: string;
  modelId: string;
  historyTurns: number;
  maxTokens: number;
  temperature: number;
  topP: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    chatTable: env.CHAT_TABLE,
    awsRegion: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1",
    modelId: env.MODEL_ID ?? "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    historyTurns: parseInteger(env.HISTORY_TURNS, 10),
    maxTokens: parseInteger(env.MAX_TOKENS, 1024),
    temperature: parseNumber(env.TEMPERATURE, 0.2),
    topP: parseNumber(env.TOP_P, 1),
  };
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer config value: ${value}`);
  }

  return Math.trunc(parsed);
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric config value: ${value}`);
  }

  return parsed;
}
