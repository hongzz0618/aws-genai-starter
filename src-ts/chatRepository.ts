import type { Message } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ChatTurnItem } from "./types";

interface StoredChatItem {
  session_id?: string;
  timestamp?: number;
  prompt?: string;
  response?: string;
  model_id?: string;
  input_tokens?: number;
  output_tokens?: number;
}

export interface ChatRepository {
  queryHistoryMessages(sessionId: string, limit: number): Promise<Message[]>;
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

  async queryHistoryMessages(sessionId: string, limit: number): Promise<Message[]> {
    if (limit <= 0) {
      return [];
    }

    const response = await this.documentClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "session_id = :session_id",
        ExpressionAttributeValues: {
          ":session_id": sessionId,
        },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );

    const items = (response.Items ?? []) as StoredChatItem[];
    const selectedItems = items.filter(isCompleteChatTurn).reverse();
    const messages: Message[] = [];

    for (const item of selectedItems) {
      messages.push(
        { role: "user", content: [{ text: item.prompt.trim() }] },
        { role: "assistant", content: [{ text: item.response.trim() }] },
      );
    }

    return messages;
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

function isCompleteChatTurn(item: StoredChatItem): item is StoredChatItem & {
  prompt: string;
  response: string;
} {
  return isNonBlankString(item.prompt) && isNonBlankString(item.response);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
