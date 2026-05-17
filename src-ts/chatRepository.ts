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
    const response = await this.documentClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "session_id = :session_id",
        ExpressionAttributeValues: {
          ":session_id": sessionId,
        },
        ScanIndexForward: true,
        Limit: Math.max(limit, 1) * 50,
      }),
    );

    const items = (response.Items ?? []) as StoredChatItem[];
    const selectedItems = items.slice(-limit);
    const messages: Message[] = [];

    for (const item of selectedItems) {
      const prompt = (item.prompt ?? "").trim();
      const responseText = (item.response ?? "").trim();

      if (prompt) {
        messages.push({ role: "user", content: [{ text: prompt }] });
      }

      if (responseText) {
        messages.push({ role: "assistant", content: [{ text: responseText }] });
      }
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
