import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ChatHistoryTurn, ChatTurnItem } from "./types";

interface StoredChatItem {
  user_id?: string;
  session_id?: string;
  sk?: string;
  prompt?: string;
  response?: string;
  model_id?: string;
  expires_at?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface ChatRepository {
  queryHistoryTurns(userId: string, sessionId: string, limit: number): Promise<ChatHistoryTurn[]>;
  saveTurn(item: ChatTurnItem): Promise<void>;
}

export class DynamoDbChatRepository implements ChatRepository {
  private readonly documentClient: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    region: string,
    documentClient?: DynamoDBDocumentClient,
  ) {
    this.documentClient =
      documentClient ?? DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  async queryHistoryTurns(
    userId: string,
    sessionId: string,
    limit: number,
  ): Promise<ChatHistoryTurn[]> {
    if (limit <= 0) {
      return [];
    }

    const sessionPrefix = getSessionSortKeyPrefix(sessionId);
    const response = await this.documentClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "user_id = :user_id AND begins_with(sk, :session_prefix)",
        ExpressionAttributeValues: {
          ":user_id": userId,
          ":session_prefix": sessionPrefix,
        },
        ConsistentRead: true,
        ScanIndexForward: false,
        Limit: limit,
      }),
    );

    const items = (response.Items ?? []) as StoredChatItem[];
    return items.filter(isCompleteChatTurn).reverse().map((item) => ({
      prompt: item.prompt.trim(),
      response: item.response.trim(),
    }));
  }

  async saveTurn(item: ChatTurnItem): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );
  }
}

export function getSessionSortKeyPrefix(sessionId: string): string {
  return `SESSION#${encodeSessionIdForSortKey(sessionId)}#`;
}

export function createTurnSortKey(sessionId: string, timestamp: number, turnId: string): string {
  return `${getSessionSortKeyPrefix(sessionId)}${formatTimestamp(timestamp)}#${turnId}`;
}

export function encodeSessionIdForSortKey(sessionId: string): string {
  return Buffer.from(sessionId, "utf8").toString("base64url");
}

function formatTimestamp(timestamp: number): string {
  return Math.trunc(timestamp).toString().padStart(13, "0");
}

function isCompleteChatTurn(item: StoredChatItem): item is StoredChatItem & {
  prompt: string;
  response: string;
} {
  return isNonBlankString(item.prompt) && isNonBlankString(item.response);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
