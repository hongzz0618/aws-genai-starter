import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { createHandler } from "../src-ts/handler";
import {
  CHAT_REQUEST_ALLOWED_FIELDS,
  CHAT_REQUEST_LIMITS,
} from "../src-ts/validation";

const root = process.cwd();
const openApi = parse(readFileSync(join(root, "openapi/openapi.yaml"), "utf8")) as OpenApiDocument;
const liveMain = readFileSync(join(root, "live/dev/main.tf"), "utf8");

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: Record<string, unknown>;
  };
}

interface Operation {
  operationId: string;
  security?: Array<Record<string, unknown>>;
  requestBody?: {
    content: {
      "application/json": {
        schema: JsonSchema;
      };
    };
  };
  responses: Record<string, {
    content?: {
      "application/json"?: {
        schema: JsonSchema;
      };
    };
  }>;
}

interface JsonSchema {
  $ref?: string;
  type?: string;
  const?: unknown;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  properties?: Record<string, JsonSchema>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

function terraformRoutes(): string[] {
  return Array.from(liveMain.matchAll(/"([A-Z]+ \/[^"]+)"\s*=/g))
    .map((match) => match[1])
    .sort();
}

function openApiRoutes(): string[] {
  return Object.entries(openApi.paths)
    .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
    .sort();
}

function resolveSchema(schema: JsonSchema): JsonSchema {
  if (!schema.$ref) {
    return schema;
  }

  const name = schema.$ref.replace("#/components/schemas/", "");
  const resolved = openApi.components.schemas[name];
  if (!resolved) {
    throw new Error(`Unresolved schema ref: ${schema.$ref}`);
  }

  return resolved;
}

function validateSchema(value: unknown, schema: JsonSchema): string[] {
  const resolved = resolveSchema(schema);
  const errors: string[] = [];

  if (resolved.const !== undefined && value !== resolved.const) {
    errors.push(`expected const ${String(resolved.const)}`);
  }

  if (resolved.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return ["expected object"];
    }

    const record = value as Record<string, unknown>;
    for (const required of resolved.required ?? []) {
      if (!(required in record)) {
        errors.push(`missing ${required}`);
      }
    }

    if (resolved.additionalProperties === false) {
      const allowed = new Set(Object.keys(resolved.properties ?? {}));
      for (const key of Object.keys(record)) {
        if (!allowed.has(key)) {
          errors.push(`unexpected ${key}`);
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(resolved.properties ?? {})) {
      if (key in record) {
        errors.push(...validateSchema(record[key], propertySchema).map((error) => `${key}: ${error}`));
      }
    }
  }

  if (resolved.type === "string" && typeof value !== "string") {
    errors.push("expected string");
  }

  if (resolved.type === "integer" && (!Number.isInteger(value))) {
    errors.push("expected integer");
  }

  if (resolved.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    errors.push("expected number");
  }

  return errors;
}

function jsonResponseSchema(path: string, method: string, status: number): JsonSchema {
  const operation = openApi.paths[path]?.[method];
  const schema = operation?.responses[String(status)]?.content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(`Missing response schema for ${method.toUpperCase()} ${path} ${status}`);
  }
  return schema;
}

describe("OpenAPI contract", () => {
  it("parses as OpenAPI 3.1 with a Cognito bearer JWT security scheme", () => {
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.components.securitySchemes.CognitoJwt).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  it("uses unique operation IDs", () => {
    const operationIds = Object.values(openApi.paths)
      .flatMap((methods) => Object.values(methods).map((operation) => operation.operationId));

    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it("keeps OpenAPI routes aligned with Terraform routes", () => {
    expect(openApiRoutes()).toEqual(terraformRoutes());
  });

  it("documents /chat as protected and /health as public", () => {
    expect(openApi.paths["/chat"].post.security).toEqual([{ CognitoJwt: [] }]);
    expect(openApi.paths["/health"].get.security).toEqual([]);
  });

  it("keeps request limits aligned with TypeScript validation constants", () => {
    const requestSchema = resolveSchema(
      openApi.paths["/chat"].post.requestBody?.content["application/json"].schema ?? {},
    );
    const properties = requestSchema.properties ?? {};

    expect(properties.prompt.maxLength).toBe(CHAT_REQUEST_LIMITS.promptMaxLength);
    expect(properties.session_id.maxLength).toBe(CHAT_REQUEST_LIMITS.sessionIdMaxLength);
    expect(properties.system_prompt.maxLength).toBe(CHAT_REQUEST_LIMITS.systemPromptMaxLength);
    expect(properties.history_turns.minimum).toBe(CHAT_REQUEST_LIMITS.historyTurnsMin);
    expect(properties.history_turns.maximum).toBe(CHAT_REQUEST_LIMITS.historyTurnsMax);
    expect(properties.max_tokens.minimum).toBe(CHAT_REQUEST_LIMITS.maxTokensMin);
    expect(properties.max_tokens.maximum).toBe(CHAT_REQUEST_LIMITS.maxTokensMax);
  });

  it("keeps ChatRequest fields aligned with the runtime allowlist", () => {
    const requestSchema = resolveSchema(
      openApi.paths["/chat"].post.requestBody?.content["application/json"].schema ?? {},
    );

    expect(requestSchema.additionalProperties).toBe(false);
    expect(Object.keys(requestSchema.properties ?? {}).sort()).toEqual(
      [...CHAT_REQUEST_ALLOWED_FIELDS].sort(),
    );
  });

  it("documents expected chat error statuses", () => {
    expect(Object.keys(openApi.paths["/chat"].post.responses).sort()).toEqual([
      "200",
      "400",
      "401",
      "500",
      "502",
      "503",
    ]);
  });

  it("validates representative handler responses against OpenAPI schemas", async () => {
    const health = await createHandler()({
      rawPath: "/health",
      requestContext: { http: { method: "GET" } },
    });
    expect(validateSchema(JSON.parse(health.body), jsonResponseSchema("/health", "get", 200))).toEqual([]);

    const unauthorized = await createHandler({ config: {
      chatTable: "chat-table",
      awsRegion: "us-east-1",
      environment: "test",
      modelId: "test-model",
      historyTurns: 10,
      maxContextChars: 24000,
      retentionDays: 7,
      maxTokens: 1024,
      temperature: 0.2,
      topP: 1,
    } })({
      rawPath: "/chat",
      body: JSON.stringify({ prompt: "hello" }),
      requestContext: { http: { method: "POST" } },
    });
    expect(validateSchema(JSON.parse(unauthorized.body), jsonResponseSchema("/chat", "post", 401))).toEqual([]);
  });
});
