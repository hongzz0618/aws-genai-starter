import type { ChatRequestBody, HttpEvent } from "./types";

export function getHttpMethod(event: HttpEvent | null | undefined): string {
  return event?.requestContext?.http?.method ?? "GET";
}

export function getRawPath(event: HttpEvent | null | undefined): string {
  return event?.rawPath ?? "/";
}

export function parseJsonBody(event: HttpEvent): ChatRequestBody {
  const body = event.body || "{}";
  const parsed: unknown = JSON.parse(body);

  if (!isRecord(parsed)) {
    throw new Error("Request body must be a JSON object");
  }

  return parsed;
}

export function stripOptionalString(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value !== "string") {
    throw new TypeError("Value does not support strip");
  }

  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError("Value must be a string");
  }

  return value;
}

export function optionalInteger(value: unknown, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer value: ${String(value)}`);
  }

  return Math.trunc(parsed);
}

export function optionalNumber(value: unknown, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${String(value)}`);
  }

  return parsed;
}

function isRecord(value: unknown): value is ChatRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
