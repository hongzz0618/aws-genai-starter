import { SERVICE_NAME } from "./config";
import { handleChat, type ChatDependencies } from "./chatService";
import { jsonResponse } from "./response";
import type { HealthResponseBody, HttpEvent, LambdaResponse } from "./types";
import { getHttpMethod, getRawPath } from "./validation";

export function createHandler(dependencies: ChatDependencies = {}) {
  return async function handleEvent(event: HttpEvent): Promise<LambdaResponse> {
    const method = getHttpMethod(event);
    const path = getRawPath(event);

    if (method === "GET" && path === "/health") {
      const body: HealthResponseBody = {
        status: "ok",
        service: SERVICE_NAME,
      };

      return jsonResponse(200, body);
    }

    if (method === "POST" && path === "/chat") {
      return handleChat(event, dependencies);
    }

    return jsonResponse(404, { error: "Not Found" });
  };
}

export const handler = createHandler();
