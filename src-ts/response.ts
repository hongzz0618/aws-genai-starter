import type { LambdaResponse } from "./types";

const headers = {
  "Content-Type": "application/json",
};

export function jsonResponse(statusCode: number, body: unknown = {}): LambdaResponse {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}
