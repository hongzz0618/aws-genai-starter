import { readFileSync } from "node:fs";
import { parse } from "yaml";

const document = parse(readFileSync("openapi/openapi.yaml", "utf8"));

if (document?.openapi !== "3.1.0") {
  throw new Error("openapi/openapi.yaml must be an OpenAPI 3.1 document");
}

const routes = Object.entries(document.paths ?? {}).flatMap(([path, methods]) => (
  Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`)
));

for (const expectedRoute of ["GET /health", "POST /chat"]) {
  if (!routes.includes(expectedRoute)) {
    throw new Error(`Missing OpenAPI route: ${expectedRoute}`);
  }
}

const chatSecurity = document.paths?.["/chat"]?.post?.security;
if (JSON.stringify(chatSecurity) !== JSON.stringify([{ CognitoJwt: [] }])) {
  throw new Error("POST /chat must require CognitoJwt security");
}

const healthSecurity = document.paths?.["/health"]?.get?.security;
if (JSON.stringify(healthSecurity) !== JSON.stringify([])) {
  throw new Error("GET /health must remain public");
}

console.log("OpenAPI validation passed");
