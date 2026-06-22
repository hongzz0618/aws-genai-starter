# ADR 001: Authenticated Session Isolation

## Context

The original chat API accepted a caller-provided `session_id` and used it as the DynamoDB partition key. That made `session_id` a global lookup boundary. If two users used the same session ID, their chat histories could collide.

The upgraded API needs Cognito authentication and user-scoped sessions while keeping the implementation small enough to inspect.

## Decision

Use Amazon Cognito User Pool authentication with an API Gateway HTTP API JWT authorizer.

`GET /health` remains public. `POST /chat` requires a JWT. The Lambda reads only `requestContext.authorizer.jwt.claims.sub` as the authenticated user identity.

DynamoDB chat history uses:

```text
PK: user_id
SK: SESSION#<base64url-session-id>#<epoch-ms-padded>#<turn-id>
```

The Lambda queries history with the authenticated `sub` as `user_id` and a `begins_with` condition for the requested encoded session prefix. The caller-facing session ID is base64url-encoded before it is placed in the sort key so delimiter characters cannot create prefix-boundary ambiguity.

## Alternatives Considered

- Keep `session_id` as the partition key and add a `user_id` attribute: rejected because it would rely on application-side filtering for isolation.
- Use a Lambda authorizer: rejected because HTTP API JWT authorizer is simpler and keeps token validation out of Lambda code.
- Add Hosted UI or federation: rejected as unnecessary for this reference.

## Consequences

The same `session_id` can be reused by different users without sharing history. Client-provided user identity is rejected and cannot override the authenticated subject.

The table schema changed. The repository does not include production data migration logic because this project is a reference without committed production data.

## Operational Implications

JWT issuer and audience must be validated after real deployment. Cognito sign-up and user lifecycle policy remain environment-specific decisions. Logs use hashed user/session identifiers and do not record JWTs or Authorization headers.
