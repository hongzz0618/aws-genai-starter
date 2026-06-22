import type { ConverseCommandInput, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandler } from "../src-ts/handler";
import type { ChatRepository } from "../src-ts/chatRepository";
import type { ChatTurnItem, HttpEvent } from "../src-ts/types";
import { CHAT_REQUEST_LIMITS } from "../src-ts/validation";

const baseConfig = {
  chatTable: "chat-table",
  awsRegion: "us-east-1",
  modelId: "test-model",
  historyTurns: 10,
  maxTokens: 1024,
  temperature: 0.2,
  topP: 1,
};

function chatEvent(body: string | object): HttpEvent {
  return {
    rawPath: "/chat",
    body: typeof body === "string" ? body : JSON.stringify(body),
    requestContext: { http: { method: "POST" } },
  };
}

function namedAwsError(name: string, message: string, httpStatusCode?: number): Error {
  const error = new Error(message) as Error & {
    $metadata?: { httpStatusCode?: number };
  };
  error.name = name;
  error.$metadata = { httpStatusCode };
  return error;
}

function createMockRepository(history: ConverseCommandInput["messages"] = []): ChatRepository & {
  queryHistoryMessages: ReturnType<typeof vi.fn>;
  saveTurn: ReturnType<typeof vi.fn>;
} {
  return {
    queryHistoryMessages: vi.fn(async () => history),
    saveTurn: vi.fn(async () => undefined),
  };
}

function createMockBedrockClient(responseText = "mock response") {
  return {
    converse: vi.fn(async (): Promise<ConverseCommandOutput> => ({
      output: {
        message: {
          role: "assistant",
          content: [{ text: responseText }],
        },
      },
      $metadata: {},
    })),
  };
}

async function expectInvalidBeforeDownstream(body: object): Promise<void> {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const repository = createMockRepository();
  const bedrockClient = createMockBedrockClient();

  const response = await createHandler({
    config: baseConfig,
    repository,
    bedrockClient,
  })(chatEvent(body));

  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  expect(response.body).not.toContain(String(Object.values(body)[0]));
  expect(repository.queryHistoryMessages).not.toHaveBeenCalled();
  expect(repository.saveTurn).not.toHaveBeenCalled();
  expect(bedrockClient.converse).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
}

describe("handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns health response", async () => {
    const response = await createHandler()({
      rawPath: "/health",
      requestContext: { http: { method: "GET" } },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "ok",
      service: "aws-genai-starter",
    });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await createHandler()({
      rawPath: "/unknown",
      requestContext: { http: { method: "GET" } },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "Not Found" });
  });

  it("returns 400 for POST /chat with malformed JSON", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent("{"));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("returns 400 for POST /chat with a non-object JSON body", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent("[]"));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("returns 400 for POST /chat with a missing prompt", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent({}));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("does not log chat failure metrics for invalid chat requests", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await createHandler({ config: baseConfig })(chatEvent({ prompt: "   " }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("returns 400 for POST /chat with a blank prompt", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent({ prompt: "   " }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("returns 400 for POST /chat with an oversized prompt", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent({
      prompt: "x".repeat(8001),
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("accepts session_id at the trimmed maximum length", async () => {
    const sessionId = "s".repeat(CHAT_REQUEST_LIMITS.sessionIdMaxLength);
    const repository = createMockRepository();
    const bedrockClient = createMockBedrockClient();

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      nowMs: () => 1710000000002,
    })(chatEvent({
      prompt: "hello",
      session_id: sessionId,
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).session_id).toBe(sessionId);
    expect(repository.queryHistoryMessages).toHaveBeenCalledWith(sessionId, baseConfig.historyTurns);
    expect(repository.saveTurn).toHaveBeenCalledWith(expect.objectContaining({
      session_id: sessionId,
    }));
  });

  it("validates session_id length after trimming", async () => {
    const sessionId = "s".repeat(CHAT_REQUEST_LIMITS.sessionIdMaxLength);
    const repository = createMockRepository();
    const bedrockClient = createMockBedrockClient();

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      nowMs: () => 1710000000003,
    })(chatEvent({
      prompt: "hello",
      session_id: `  ${sessionId}  `,
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).session_id).toBe(sessionId);
    expect(repository.queryHistoryMessages).toHaveBeenCalledWith(sessionId, baseConfig.historyTurns);
  });

  it("rejects oversized session_id before DynamoDB or Bedrock calls", async () => {
    await expectInvalidBeforeDownstream({
      prompt: "hello",
      session_id: "s".repeat(CHAT_REQUEST_LIMITS.sessionIdMaxLength + 1),
    });
  });

  it("returns 400 for POST /chat with invalid history_turns", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent({
      prompt: "hello",
      history_turns: 21,
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("returns 400 for POST /chat with invalid max_tokens", async () => {
    const response = await createHandler({ config: baseConfig })(chatEvent({
      prompt: "hello",
      max_tokens: 0,
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
  });

  it("returns 400 for POST /chat with invalid temperature or top_p", async () => {
    for (const body of [
      { prompt: "hello", temperature: 1.1 },
      { prompt: "hello", top_p: "0.9" },
    ]) {
      const response = await createHandler({ config: baseConfig })(chatEvent(body));

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
    }
  });

  it("returns 400 for invalid field types and decimal integer values", async () => {
    for (const body of [
      { prompt: 123 },
      { prompt: "hello", session_id: null },
      { prompt: "hello", system_prompt: false },
      { prompt: "hello", history_turns: 1.5 },
      { prompt: "hello", history_turns: null },
      { prompt: "hello", max_tokens: "10" },
      { prompt: "hello", temperature: null },
      { prompt: "hello", top_p: {} },
    ]) {
      const response = await createHandler({ config: baseConfig })(chatEvent(body));

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
    }
  });

  it("continues to generate a session ID when session_id is blank", async () => {
    const repository = createMockRepository();
    const bedrockClient = createMockBedrockClient();

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      generateSessionId: () => "generated-session",
      nowMs: () => 1710000000004,
    })(chatEvent({
      prompt: "hello",
      session_id: "   ",
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).session_id).toBe("generated-session");
    expect(repository.queryHistoryMessages).toHaveBeenCalledWith(
      "generated-session",
      baseConfig.historyTurns,
    );
  });

  it("rejects non-string session_id before DynamoDB or Bedrock calls", async () => {
    await expectInvalidBeforeDownstream({
      prompt: "hello",
      session_id: 123,
    });
  });

  it("accepts system_prompt at the trimmed maximum length and sends it to Bedrock", async () => {
    const systemPrompt = "s".repeat(CHAT_REQUEST_LIMITS.systemPromptMaxLength);
    const repository = createMockRepository();
    const bedrockClient = createMockBedrockClient();

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      generateSessionId: () => "system-session",
      nowMs: () => 1710000000005,
    })(chatEvent({
      prompt: "hello",
      system_prompt: systemPrompt,
    }));

    expect(response.statusCode).toBe(200);
    expect(bedrockClient.converse).toHaveBeenCalledWith(expect.objectContaining({
      system: [{ text: systemPrompt }],
    }));
  });

  it("validates system_prompt length after trimming", async () => {
    const systemPrompt = "s".repeat(CHAT_REQUEST_LIMITS.systemPromptMaxLength);
    const repository = createMockRepository();
    const bedrockClient = createMockBedrockClient();

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      generateSessionId: () => "system-session",
      nowMs: () => 1710000000006,
    })(chatEvent({
      prompt: "hello",
      system_prompt: `  ${systemPrompt}  `,
    }));

    expect(response.statusCode).toBe(200);
    expect(bedrockClient.converse).toHaveBeenCalledWith(expect.objectContaining({
      system: [{ text: systemPrompt }],
    }));
  });

  it("does not add a Bedrock system prompt when system_prompt is blank", async () => {
    const repository = createMockRepository();
    const bedrockClient = createMockBedrockClient();

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      generateSessionId: () => "system-session",
      nowMs: () => 1710000000007,
    })(chatEvent({
      prompt: "hello",
      system_prompt: "   ",
    }));

    expect(response.statusCode).toBe(200);
    expect(bedrockClient.converse).toHaveBeenCalledWith(expect.not.objectContaining({
      system: expect.anything(),
    }));
  });

  it("rejects oversized system_prompt before DynamoDB or Bedrock calls", async () => {
    await expectInvalidBeforeDownstream({
      prompt: "hello",
      system_prompt: "s".repeat(CHAT_REQUEST_LIMITS.systemPromptMaxLength + 1),
    });
  });

  it("rejects non-string system_prompt before DynamoDB or Bedrock calls", async () => {
    await expectInvalidBeforeDownstream({
      prompt: "hello",
      system_prompt: 123,
    });
  });

  it("returns 400 when request-level model_id is supplied", async () => {
    const bedrockClient = {
      converse: vi.fn(async (): Promise<ConverseCommandOutput> => ({
        output: { message: { role: "assistant", content: [{ text: "unused" }] } },
        $metadata: {},
      })),
    };
    const response = await createHandler({
      config: baseConfig,
      bedrockClient,
    })(chatEvent({
      prompt: "hello",
      model_id: "override-model",
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Invalid chat request" });
    expect(bedrockClient.converse).not.toHaveBeenCalled();
  });

  it("returns 500 for POST /chat when CHAT_TABLE is missing", async () => {
    const response = await createHandler({
      config: { ...baseConfig, chatTable: undefined },
    })(chatEvent({ prompt: "hello" }));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "Chat request failed" });
  });

  it("handles POST /chat success with mocked Bedrock and DynamoDB", async () => {
    const savedItems: ChatTurnItem[] = [];
    const repository: ChatRepository = {
      async queryHistoryMessages() {
        return [
          { role: "user", content: [{ text: "previous prompt" }] },
          { role: "assistant", content: [{ text: "previous response" }] },
        ];
      },
      async saveTurn(item) {
        savedItems.push(item);
      },
    };
    const bedrockRequests: ConverseCommandInput[] = [];
    const bedrockClient = {
      async converse(input: ConverseCommandInput): Promise<ConverseCommandOutput> {
        bedrockRequests.push(input);
        return {
          output: {
            message: {
              role: "assistant",
              content: [{ text: "mock response" }],
            },
          },
          usage: {
            inputTokens: 12,
            outputTokens: 4,
            totalTokens: 16,
          },
          stopReason: "end_turn",
          $metadata: {},
        };
      },
    };
    const event: HttpEvent = {
      rawPath: "/chat",
      body: JSON.stringify({
        prompt: "hello",
        session_id: "session-1",
        system_prompt: "be brief",
        history_turns: 2,
        max_tokens: 99,
        temperature: 0.3,
        top_p: 0.9,
      }),
      requestContext: { http: { method: "POST" } },
    };

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      nowMs: () => 1710000000000,
      generateSessionId: () => "generated-session",
    })(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      session_id: "session-1",
      timestamp: 1710000000000,
      response: "mock response",
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      },
      stopReason: "end_turn",
    });
    expect(bedrockRequests).toHaveLength(1);
    expect(bedrockRequests[0]).toMatchObject({
      modelId: "test-model",
      system: [{ text: "be brief" }],
      inferenceConfig: {
        maxTokens: 99,
        temperature: 0.3,
        topP: 0.9,
      },
    });
    expect(bedrockRequests[0]?.messages).toEqual([
      { role: "user", content: [{ text: "previous prompt" }] },
      { role: "assistant", content: [{ text: "previous response" }] },
      { role: "user", content: [{ text: "hello" }] },
    ]);
    expect(savedItems).toEqual([
      {
        session_id: "session-1",
        timestamp: 1710000000000,
        prompt: "hello",
        response: "mock response",
        model_id: "test-model",
        input_tokens: 12,
        output_tokens: 4,
      },
    ]);
  });

  it("accepts documented parameter boundaries", async () => {
    const historyLimits: number[] = [];
    const repository: ChatRepository = {
      async queryHistoryMessages(_sessionId, limit) {
        historyLimits.push(limit);
        return [];
      },
      async saveTurn() {
        return undefined;
      },
    };
    const bedrockRequests: ConverseCommandInput[] = [];
    const bedrockClient = {
      async converse(input: ConverseCommandInput): Promise<ConverseCommandOutput> {
        bedrockRequests.push(input);
        return {
          output: {
            message: {
              role: "assistant",
              content: [{ text: "boundary response" }],
            },
          },
          $metadata: {},
        };
      },
    };

    const handler = createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
      generateSessionId: () => "boundary-session",
      nowMs: () => 1710000000001,
    });

    const lowerResponse = await handler(chatEvent({
      prompt: "hello",
      history_turns: 0,
      max_tokens: 1,
      temperature: 0,
      top_p: 0,
    }));
    const upperResponse = await handler(chatEvent({
      prompt: "x".repeat(8000),
      history_turns: 20,
      max_tokens: 4096,
      temperature: 1,
      top_p: 1,
    }));

    expect(lowerResponse.statusCode).toBe(200);
    expect(upperResponse.statusCode).toBe(200);
    expect(historyLimits).toEqual([0, 20]);
    expect(bedrockRequests[0]?.inferenceConfig).toEqual({
      maxTokens: 1,
      temperature: 0,
      topP: 0,
    });
    expect(bedrockRequests[1]?.inferenceConfig).toEqual({
      maxTokens: 4096,
      temperature: 1,
      topP: 1,
    });
  });

  it("returns 503 without raw AWS details when Bedrock is throttled", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: ChatRepository = {
      async queryHistoryMessages() {
        return [];
      },
      async saveTurn() {
        throw new Error("saveTurn should not be called");
      },
    };
    const bedrockClient = {
      async converse(): Promise<ConverseCommandOutput> {
        throw namedAwsError("ThrottlingException", "rate limit: request abc", 429);
      },
    };

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
    })(chatEvent({ prompt: "hello" }));

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Chat service temporarily unavailable",
    });
    expect(response.body).not.toContain("request abc");
    expect(consoleError).toHaveBeenCalledOnce();
    const logEntry = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
    expect(logEntry).toMatchObject({
      level: "error",
      event: "chat_request_failed",
      category: "bedrock_retryable",
      errorName: "ThrottlingException",
      httpStatusCode: 429,
    });
    expect(logEntry).not.toHaveProperty("errorMessage");
  });

  it("returns a generic error when Bedrock access is denied", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: ChatRepository = {
      async queryHistoryMessages() {
        return [];
      },
      async saveTurn() {
        throw new Error("saveTurn should not be called");
      },
    };
    const bedrockClient = {
      async converse(): Promise<ConverseCommandOutput> {
        throw namedAwsError("AccessDeniedException", "internal account detail", 403);
      },
    };

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
    })(chatEvent({ prompt: "hello" }));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "Chat request failed" });
    expect(response.body).not.toContain("AccessDeniedException");
    expect(response.body).not.toContain("internal account detail");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("returns a generic upstream error when Bedrock rejects the service request", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: ChatRepository = {
      async queryHistoryMessages() {
        return [];
      },
      async saveTurn() {
        throw new Error("saveTurn should not be called");
      },
    };
    const bedrockClient = {
      async converse(): Promise<ConverseCommandOutput> {
        throw namedAwsError("ValidationException", "raw model validation detail", 400);
      },
    };

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
    })(chatEvent({ prompt: "hello" }));

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({ error: "Chat request failed" });
    expect(response.body).not.toContain("raw model validation detail");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("returns a generic error when persistence fails after Bedrock succeeds", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: ChatRepository = {
      async queryHistoryMessages() {
        return [];
      },
      async saveTurn() {
        throw new Error("DynamoDB table detail");
      },
    };
    const bedrockClient = {
      async converse(): Promise<ConverseCommandOutput> {
        return {
          output: {
            message: {
              role: "assistant",
              content: [{ text: "mock response" }],
            },
          },
          $metadata: {},
        };
      },
    };

    const response = await createHandler({
      config: baseConfig,
      repository,
      bedrockClient,
    })(chatEvent({ prompt: "hello" }));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "Chat request failed" });
    expect(response.body).not.toContain("DynamoDB table detail");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
