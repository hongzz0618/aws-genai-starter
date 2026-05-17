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
  optionalInteger,
  optionalNumber,
  optionalString,
  parseJsonBody,
  stripOptionalString,
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
  const config = dependencies.config ?? loadConfig();

  if (!config.chatTable) {
    return jsonResponse(500, { error: "CHAT_TABLE not configured" });
  }

  try {
    const payload = parseJsonBody(event);
    const sessionId =
      optionalString(payload.session_id) ??
      (dependencies.generateSessionId ?? randomUUID)();
    const prompt = stripOptionalString(payload.prompt);

    if (!prompt) {
      return jsonResponse(400, { error: "Missing 'prompt'" });
    }

    const systemPrompt = stripOptionalString(payload.system_prompt);
    const modelId = optionalString(payload.model_id) ?? config.modelId;
    const historyTurns = optionalInteger(payload.history_turns, config.historyTurns);
    const maxTokens = optionalInteger(payload.max_tokens, config.maxTokens);
    const temperature = optionalNumber(payload.temperature, config.temperature);
    const topP = optionalNumber(payload.top_p, config.topP);

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
    return jsonResponse(500, {
      error: "Bedrock call failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
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
