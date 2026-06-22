import type { ChatRequestBody, HttpEvent } from "./types";

export const INVALID_CHAT_REQUEST_ERROR = "Invalid chat request";

export const CHAT_REQUEST_LIMITS = {
  promptMaxLength: 8000,
  sessionIdMaxLength: 128,
  systemPromptMaxLength: 4000,
  historyTurnsMin: 0,
  historyTurnsMax: 20,
  maxTokensMin: 1,
  maxTokensMax: 4096,
  temperatureMin: 0,
  temperatureMax: 1,
  topPMin: 0,
  topPMax: 1,
} as const;

export class InvalidChatRequestError extends Error {
  constructor() {
    super(INVALID_CHAT_REQUEST_ERROR);
    this.name = "InvalidChatRequestError";
  }
}

export function getHttpMethod(event: HttpEvent | null | undefined): string {
  return event?.requestContext?.http?.method ?? "GET";
}

export function getRawPath(event: HttpEvent | null | undefined): string {
  return event?.rawPath ?? "/";
}

export function parseJsonBody(event: HttpEvent): ChatRequestBody {
  const body = event.body || "{}";
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new InvalidChatRequestError();
  }

  if (!isRecord(parsed)) {
    throw new InvalidChatRequestError();
  }

  return parsed;
}

export function requiredTrimmedString(
  value: unknown,
  options: { maxLength?: number } = {},
): string {
  const trimmed = trimStringValue(value, options);
  if (!trimmed) {
    throw new InvalidChatRequestError();
  }

  return trimmed;
}

export function optionalTrimmedString(
  value: unknown,
  options: { maxLength?: number } = {},
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = trimStringValue(value, options);
  return trimmed || undefined;
}

function trimStringValue(value: unknown, options: { maxLength?: number }): string {
  if (typeof value !== "string") {
    throw new InvalidChatRequestError();
  }

  const trimmed = value.trim();
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new InvalidChatRequestError();
  }

  return trimmed;
}

export function optionalIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new InvalidChatRequestError();
  }

  return value;
}

export function optionalNumberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new InvalidChatRequestError();
  }

  return value;
}

function isRecord(value: unknown): value is ChatRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
