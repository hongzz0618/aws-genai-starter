import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import {
  createTurnSortKey,
  DynamoDbChatRepository,
  encodeSessionIdForSortKey,
} from "../src-ts/chatRepository";

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
    user_id: "user-a",
    session_id: "session-1",
    sk: createTurnSortKey("session-1", timestamp, `turn-${timestamp}`),
    prompt,
    response,
    model_id: "model",
    expires_at: 1710604800,
  };
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

    const turns = await repository.queryHistoryTurns("user-a", "session-1", 0);

    expect(turns).toEqual([]);
    expect(mock.sentCommands).toEqual([]);
  });

  it("queries latest turns by authenticated user and session prefix", async () => {
    const mock = createMockDocumentClient();
    const repository = createRepository(mock);

    await repository.queryHistoryTurns("user-a", "session-1", 2);

    expect(getQueryInput(mock.sentCommands)).toMatchObject({
      TableName: "chat-table",
      KeyConditionExpression: "user_id = :user_id AND begins_with(sk, :session_prefix)",
      ExpressionAttributeValues: {
        ":user_id": "user-a",
        ":session_prefix": "SESSION#c2Vzc2lvbi0x#",
      },
      ScanIndexForward: false,
      Limit: 2,
    });
  });

  it("uses the authenticated user key even when another user knows the same session ID", async () => {
    const mock = createMockDocumentClient();
    const repository = createRepository(mock);

    await repository.queryHistoryTurns("user-b", "session-1", 2);

    expect(getQueryInput(mock.sentCommands).ExpressionAttributeValues).toMatchObject({
      ":user_id": "user-b",
      ":session_prefix": "SESSION#c2Vzc2lvbi0x#",
    });
  });

  it("encodes session IDs before building prefix keys to avoid delimiter collisions", async () => {
    const mock = createMockDocumentClient();
    const repository = createRepository(mock);
    const sessionId = "demo#session/one: \u03b1";

    await repository.queryHistoryTurns("user-a", sessionId, 2);

    const expressionValues = getQueryInput(mock.sentCommands).ExpressionAttributeValues;
    expect(expressionValues?.[":session_prefix"]).toBe(
      `SESSION#${encodeSessionIdForSortKey(sessionId)}#`,
    );
    expect(String(expressionValues?.[":session_prefix"])).not.toContain(sessionId);
  });

  it("returns the latest turns in chronological order for Bedrock", async () => {
    const mock = createMockDocumentClient([
      turn(5, "turn 5 prompt", "turn 5 response"),
      turn(4, "turn 4 prompt", "turn 4 response"),
    ]);
    const repository = createRepository(mock);

    const turns = await repository.queryHistoryTurns("user-a", "session-1", 2);

    expect(turns).toEqual([
      { prompt: "turn 4 prompt", response: "turn 4 response" },
      { prompt: "turn 5 prompt", response: "turn 5 response" },
    ]);
  });

  it("returns available turns when history has fewer items than the requested limit", async () => {
    const mock = createMockDocumentClient([
      turn(2, "turn 2 prompt", "turn 2 response"),
      turn(1, "turn 1 prompt", "turn 1 response"),
    ]);
    const repository = createRepository(mock);

    const turns = await repository.queryHistoryTurns("user-a", "session-1", 10);

    expect(getQueryInput(mock.sentCommands).Limit).toBe(10);
    expect(turns).toEqual([
      { prompt: "turn 1 prompt", response: "turn 1 response" },
      { prompt: "turn 2 prompt", response: "turn 2 response" },
    ]);
  });

  it("skips incomplete or invalid chat turn items", async () => {
    const mock = createMockDocumentClient([
      turn(6, "new prompt", "new response"),
      { session_id: "session-1", sk: "SESSION#c2Vzc2lvbi0x#5", prompt: "missing response" },
      { session_id: "session-1", sk: "SESSION#c2Vzc2lvbi0x#4", response: "missing prompt" },
      turn(3, "   ", "blank prompt"),
      turn(2, "blank response", "   "),
      { session_id: "session-1", sk: "SESSION#c2Vzc2lvbi0x#1", prompt: 123, response: "wrong type" },
    ]);
    const repository = createRepository(mock);

    const turns = await repository.queryHistoryTurns("user-a", "session-1", 6);

    expect(turns).toEqual([
      { prompt: "new prompt", response: "new response" },
    ]);
  });

  it("creates unique same-millisecond sort keys with caller-provided turn IDs", () => {
    expect(createTurnSortKey("session-1", 1710000000000, "turn-a")).toBe(
      "SESSION#c2Vzc2lvbi0x#1710000000000#turn-a",
    );
    expect(createTurnSortKey("session-1", 1710000000000, "turn-b")).toBe(
      "SESSION#c2Vzc2lvbi0x#1710000000000#turn-b",
    );
  });
});
