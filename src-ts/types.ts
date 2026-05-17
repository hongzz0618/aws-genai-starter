export interface HttpRequestContext {
  http?: {
    method?: string;
  };
}

export interface HttpEvent {
  rawPath?: string;
  body?: string | null;
  requestContext?: HttpRequestContext;
}

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface HealthResponseBody {
  status: "ok";
  service: string;
}

export interface ErrorResponseBody {
  error: string;
  detail?: string;
}

export interface ChatRequestBody {
  prompt?: unknown;
  session_id?: unknown;
  system_prompt?: unknown;
  model_id?: unknown;
  history_turns?: unknown;
  max_tokens?: unknown;
  temperature?: unknown;
  top_p?: unknown;
}

export interface ChatTurnItem {
  session_id: string;
  timestamp: number;
  prompt: string;
  response: string;
  model_id: string;
  input_tokens?: number;
  output_tokens?: number;
}

export interface ChatSuccessResponseBody {
  session_id: string;
  timestamp: number;
  response: string;
  usage: unknown;
  stopReason: string | undefined;
}
