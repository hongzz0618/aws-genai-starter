import type { LambdaResponse } from "./types";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export function jsonResponse(statusCode: number, body: unknown = {}): LambdaResponse {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}
