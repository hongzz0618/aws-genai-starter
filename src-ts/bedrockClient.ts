import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";

export interface BedrockConverseClient {
  converse(input: ConverseCommandInput): Promise<ConverseCommandOutput>;
}

export class AwsBedrockConverseClient implements BedrockConverseClient {
  private readonly client: BedrockRuntimeClient;

  constructor(region: string) {
    this.client = new BedrockRuntimeClient({ region });
  }

  async converse(input: ConverseCommandInput): Promise<ConverseCommandOutput> {
    return this.client.send(new ConverseCommand(input));
  }
}

export function extractResponseText(response: ConverseCommandOutput): string {
  const firstContentBlock = response.output?.message?.content?.[0];
  return firstContentBlock?.text ?? "";
}
