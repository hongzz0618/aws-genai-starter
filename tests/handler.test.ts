import type { ConverseCommandInput, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it } from "vitest";
import { createHandler } from "../src-ts/handler";
import type { ChatRepository } from "../src-ts/chatRepository";
import type { ChatTurnItem, HttpEvent } from "../src-ts/types";

const baseConfig = {
  chatTable: "chat-table",
  awsRegion: "us-east-1",
  modelId: "test-model",
  historyTurns: 10,
  maxTokens: 1024,
  temperature: 0.2,
  topP: 1,
};

describe("handler", () => {
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

  it("returns 400 for POST /chat with missing prompt", async () => {
    const response = await createHandler({ config: baseConfig })({
      rawPath: "/chat",
      body: "{}",
      requestContext: { http: { method: "POST" } },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "Missing 'prompt'" });
  });

  it("returns 500 for POST /chat when CHAT_TABLE is missing", async () => {
    const response = await createHandler({
      config: { ...baseConfig, chatTable: undefined },
    })({
      rawPath: "/chat",
      body: JSON.stringify({ prompt: "hello" }),
      requestContext: { http: { method: "POST" } },
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "CHAT_TABLE not configured" });
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
        model_id: "override-model",
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
      modelId: "override-model",
      system: [{ text: "be brief" }],
      inferenceConfig: {
        maxTokens: 99,
        temperature: 0.3,
        topP: 0.9,
      },
    });
    expect(bedrockRequests[0]?.messages).toHaveLength(3);
    expect(savedItems).toEqual([
      {
        session_id: "session-1",
        timestamp: 1710000000000,
        prompt: "hello",
        response: "mock response",
        model_id: "override-model",
        input_tokens: 12,
        output_tokens: 4,
      },
    ]);
  });
});
