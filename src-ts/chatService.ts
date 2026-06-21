import type {
  ConverseCommandInput,
  ConverseCommandOutput,
  Message,
} from "@aws-sdk/client-bedrock-runtime";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config";
import { loadConfig } from "./config";
import {
  AwsBedrockConverseClient,
  extractResponseText,
  type BedrockConverseClient,
} from "./bedrockClient";
import {
  DynamoDbChatRepository,
  type ChatRepository,
} from "./chatRepository";
import { jsonResponse } from "./response";
import type { ChatSuccessResponseBody, ChatTurnItem, HttpEvent, LambdaResponse } from "./types";
import {
  CHAT_REQUEST_LIMITS,
  INVALID_CHAT_REQUEST_ERROR,
  InvalidChatRequestError,
  optionalIntegerInRange,
  optionalNumberInRange,
  parseJsonBody,
  optionalTrimmedString,
  requiredTrimmedString,
} from "./validation";

export interface ChatDependencies {
  config?: AppConfig;
  repository?: ChatRepository;
  bedrockClient?: BedrockConverseClient;
  generateSessionId?: () => string;
  nowMs?: () => number;
}

export async function handleChat(
  event: HttpEvent,
  dependencies: ChatDependencies = {},
): Promise<LambdaResponse> {
  try {
    const config = dependencies.config ?? loadConfig();

    if (!config.chatTable) {
      throw new ChatServiceError("ConfigurationError");
    }

    const payload = parseJsonBody(event);
    const sessionId =
      optionalTrimmedString(payload.session_id) ??
      (dependencies.generateSessionId ?? randomUUID)();
    const prompt = requiredTrimmedString(payload.prompt, {
      maxLength: CHAT_REQUEST_LIMITS.promptMaxLength,
    });

    if (Object.prototype.hasOwnProperty.call(payload, "model_id")) {
      throw new InvalidChatRequestError();
    }

    const systemPrompt = optionalTrimmedString(payload.system_prompt);
    const modelId = config.modelId;
    const historyTurns = optionalIntegerInRange(
      payload.history_turns,
      config.historyTurns,
      CHAT_REQUEST_LIMITS.historyTurnsMin,
      CHAT_REQUEST_LIMITS.historyTurnsMax,
    );
    const maxTokens = optionalIntegerInRange(
      payload.max_tokens,
      config.maxTokens,
      CHAT_REQUEST_LIMITS.maxTokensMin,
      CHAT_REQUEST_LIMITS.maxTokensMax,
    );
    const temperature = optionalNumberInRange(
      payload.temperature,
      config.temperature,
      CHAT_REQUEST_LIMITS.temperatureMin,
      CHAT_REQUEST_LIMITS.temperatureMax,
    );
    const topP = optionalNumberInRange(
      payload.top_p,
      config.topP,
      CHAT_REQUEST_LIMITS.topPMin,
      CHAT_REQUEST_LIMITS.topPMax,
    );

    const repository =
      dependencies.repository ??
      new DynamoDbChatRepository(config.chatTable, config.awsRegion);
    const bedrockClient =
      dependencies.bedrockClient ?? new AwsBedrockConverseClient(config.awsRegion);

    const messages = await repository.queryHistoryMessages(sessionId, historyTurns);
    messages.push(createTextMessage("user", prompt));

    const bedrockRequest: ConverseCommandInput = {
      modelId,
      messages,
      inferenceConfig: {
        maxTokens,
        temperature,
        topP,
      },
    };

    if (systemPrompt) {
      bedrockRequest.system = [{ text: systemPrompt }];
    }

    const bedrockResponse = await bedrockClient.converse(bedrockRequest);
    const responseText = extractResponseText(bedrockResponse);
    const timestamp = (dependencies.nowMs ?? Date.now)();
    const usage = bedrockResponse.usage ?? {};

    await repository.saveTurn(createTurnItem({
      sessionId,
      timestamp,
      prompt,
      responseText,
      modelId,
      bedrockResponse,
    }));

    const responseBody: ChatSuccessResponseBody = {
      session_id: sessionId,
      timestamp,
      response: responseText,
      usage,
      stopReason: bedrockResponse.stopReason,
    };

    return jsonResponse(200, responseBody);
  } catch (error) {
    const failure = classifyChatFailure(error);
    if (failure.category !== "invalid_request") {
      logChatError(error, failure.category);
    }
    return jsonResponse(failure.statusCode, { error: failure.publicError });
  }
}

class ChatServiceError extends Error {
  constructor(name: string) {
    super(name);
    this.name = name;
  }
}

interface ChatFailure {
  statusCode: number;
  publicError: string;
  category: string;
}

function classifyChatFailure(error: unknown): ChatFailure {
  const errorName = getErrorName(error);

  if (error instanceof InvalidChatRequestError) {
    return {
      statusCode: 400,
      publicError: INVALID_CHAT_REQUEST_ERROR,
      category: "invalid_request",
    };
  }

  if (isBedrockThrottlingError(errorName)) {
    return {
      statusCode: 503,
      publicError: "Chat service temporarily unavailable",
      category: "bedrock_retryable",
    };
  }

  if (isBedrockAccessDeniedError(errorName)) {
    return {
      statusCode: 500,
      publicError: "Chat request failed",
      category: "bedrock_access_denied",
    };
  }

  if (isBedrockValidationError(errorName)) {
    return {
      statusCode: 502,
      publicError: "Chat request failed",
      category: "bedrock_validation",
    };
  }

  return {
    statusCode: 500,
    publicError: "Chat request failed",
    category: "internal",
  };
}

function isBedrockThrottlingError(errorName: string): boolean {
  return [
    "ThrottlingException",
    "TooManyRequestsException",
    "ServiceUnavailableException",
    "ModelNotReadyException",
  ].includes(errorName);
}

function isBedrockAccessDeniedError(errorName: string): boolean {
  return ["AccessDeniedException", "UnauthorizedOperation"].includes(errorName);
}

function isBedrockValidationError(errorName: string): boolean {
  return ["ValidationException"].includes(errorName);
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return undefined;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
  return typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

function logChatError(error: unknown, category: string): void {
  const errorFields = error instanceof Error
    ? { errorName: error.name }
    : { errorName: "UnknownError" };
  const httpStatusCode = getErrorStatusCode(error);

  console.error(JSON.stringify({
    level: "error",
    event: "chat_request_failed",
    message: "Chat request failed",
    category,
    ...errorFields,
    ...(httpStatusCode === undefined ? {} : { httpStatusCode }),
  }));
}

function createTextMessage(role: "user" | "assistant", text: string): Message {
  return { role, content: [{ text }] };
}

function createTurnItem(input: {
  sessionId: string;
  timestamp: number;
  prompt: string;
  responseText: string;
  modelId: string;
  bedrockResponse: ConverseCommandOutput;
}): ChatTurnItem {
  const item: ChatTurnItem = {
    session_id: input.sessionId,
    timestamp: input.timestamp,
    prompt: input.prompt,
    response: input.responseText,
    model_id: input.modelId,
  };

  const usage = input.bedrockResponse.usage;
  if (usage?.inputTokens !== undefined) {
    item.input_tokens = Number(usage.inputTokens);
  }

  if (usage?.outputTokens !== undefined) {
    item.output_tokens = Number(usage.outputTokens);
  }

  return item;
}
