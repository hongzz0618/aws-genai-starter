import type { Message } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { DynamoDbChatRepository } from "../src-ts/chatRepository";

interface MockDocumentClient {
  documentClient: DynamoDBDocumentClient;
  sentCommands: unknown[];
}

function createMockDocumentClient(items: Record<string, unknown>[] = []): MockDocumentClient {
  const sentCommands: unknown[] = [];
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  vi.spyOn(documentClient, "send").mockImplementation(
    (command): ReturnType<DynamoDBDocumentClient["send"]> => {
      sentCommands.push(command);
      return Promise.resolve({ Items: items }) as ReturnType<DynamoDBDocumentClient["send"]>;
    },
  );

  return { documentClient, sentCommands };
}

function createRepository(mock: MockDocumentClient): DynamoDbChatRepository {
  return new DynamoDbChatRepository("chat-table", "us-east-1", mock.documentClient);
}

function turn(timestamp: number, prompt: string, response: string): Record<string, unknown> {
  return {
    session_id: "session-1",
    timestamp,
    prompt,
    response,
    model_id: "model",
  };
}

function textMessages(messages: Message[]): Array<{ role: Message["role"]; text: string }> {
  return messages.map((message) => ({
    role: message.role,
    text: message.content?.[0]?.text ?? "",
  }));
}

function getQueryInput(sentCommands: unknown[]): QueryCommandInput {
  expect(sentCommands).toHaveLength(1);
  const command = sentCommands[0];
  expect(command).toBeInstanceOf(QueryCommand);
  return (command as QueryCommand).input;
}

describe("DynamoDbChatRepository", () => {
  it("returns no history and does not query DynamoDB when limit is zero", async () => {
    const mock = createMockDocumentClient([turn(1, "old prompt", "old response")]);
    const repository = createRepository(mock);

    const messages = await repository.queryHistoryMessages("session-1", 0);

    expect(messages).toEqual([]);
    expect(mock.sentCommands).toEqual([]);
  });

  it("queries the latest turns with descending sort order and the requested limit", async () => {
    const mock = createMockDocumentClient();
    const repository = createRepository(mock);

    await repository.queryHistoryMessages("session-1", 2);

    expect(getQueryInput(mock.sentCommands)).toMatchObject({
      TableName: "chat-table",
      KeyConditionExpression: "session_id = :session_id",
      ExpressionAttributeValues: {
        ":session_id": "session-1",
      },
      ScanIndexForward: false,
      Limit: 2,
    });
  });

  it("returns the latest turns in chronological order for Bedrock", async () => {
    const mock = createMockDocumentClient([
      turn(5, "turn 5 prompt", "turn 5 response"),
      turn(4, "turn 4 prompt", "turn 4 response"),
    ]);
    const repository = createRepository(mock);

    const messages = await repository.queryHistoryMessages("session-1", 2);

    expect(textMessages(messages)).toEqual([
      { role: "user", text: "turn 4 prompt" },
      { role: "assistant", text: "turn 4 response" },
      { role: "user", text: "turn 5 prompt" },
      { role: "assistant", text: "turn 5 response" },
    ]);
  });

  it("returns available turns when history has fewer items than the requested limit", async () => {
    const mock = createMockDocumentClient([
      turn(2, "turn 2 prompt", "turn 2 response"),
      turn(1, "turn 1 prompt", "turn 1 response"),
    ]);
    const repository = createRepository(mock);

    const messages = await repository.queryHistoryMessages("session-1", 10);

    expect(getQueryInput(mock.sentCommands).Limit).toBe(10);
    expect(textMessages(messages)).toEqual([
      { role: "user", text: "turn 1 prompt" },
      { role: "assistant", text: "turn 1 response" },
      { role: "user", text: "turn 2 prompt" },
      { role: "assistant", text: "turn 2 response" },
    ]);
  });

  it("returns an empty message list when DynamoDB has no history", async () => {
    const mock = createMockDocumentClient();
    const repository = createRepository(mock);

    const messages = await repository.queryHistoryMessages("session-1", 3);

    expect(messages).toEqual([]);
  });

  it("skips incomplete or invalid chat turn items", async () => {
    const mock = createMockDocumentClient([
      turn(6, "new prompt", "new response"),
      { session_id: "session-1", timestamp: 5, prompt: "missing response" },
      { session_id: "session-1", timestamp: 4, response: "missing prompt" },
      turn(3, "   ", "blank prompt"),
      turn(2, "blank response", "   "),
      { session_id: "session-1", timestamp: 1, prompt: 123, response: "wrong type" },
    ]);
    const repository = createRepository(mock);

    const messages = await repository.queryHistoryMessages("session-1", 6);

    expect(textMessages(messages)).toEqual([
      { role: "user", text: "new prompt" },
      { role: "assistant", text: "new response" },
    ]);
  });
});
