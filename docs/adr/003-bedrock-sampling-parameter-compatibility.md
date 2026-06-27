# ADR 003: Bedrock Sampling Parameter Compatibility

## Context

The chat API exposes `temperature` and `top_p` as optional client-controlled sampling fields. During live Bedrock validation with Claude Haiku 4.5, the model rejected requests that specified both values.

The previous implementation filled defaults for both fields, which made an otherwise valid request fail upstream even when the client did not intend to configure both parameters.

## Decision

Treat `temperature` and `top_p` as mutually exclusive API fields.

A request can provide at most one of them. If both are present, the Lambda returns HTTP 400 before DynamoDB history lookup or Bedrock invocation. When only `temperature` is provided, the Bedrock request includes only `temperature`. When only `top_p` is provided, the Bedrock request includes only `topP`. When neither is provided, the Bedrock request includes only the configured default `temperature`.

Presence is checked with explicit `undefined` comparisons rather than JavaScript truthiness because `0` is a valid boundary value.

## Alternatives Considered

- Always send both default parameters: rejected because the validated model path rejects that combination.
- Remove `top_p` support: rejected because it would unnecessarily narrow the public API.
- Let Bedrock return the error: rejected because a predictable client-side contract conflict would become an upstream 502 instead of a local 400.

## Consequences

The OpenAPI schema, runtime validation, and tests now define the same contract. Clients can tune either `temperature` or `top_p`, but not both in one request.

The default path remains small and deterministic: the service sends the configured default `temperature` and does not send `topP`.

## Operational Implications

Invalid sampling combinations are rejected before reading DynamoDB or calling Bedrock, reducing avoidable upstream calls and keeping the error category client-facing.

If a future model supports both parameters together, the API contract should still be changed deliberately rather than inferred from provider behavior.

## Validation

Tests cover these paths:

- both `temperature` and `top_p` return HTTP 400 before DynamoDB or Bedrock calls
- only `temperature` sends only `temperature`
- only `top_p` sends only `topP`
- neither field sends only the configured default `temperature`
- boundary values such as `temperature: 0` and `top_p: 1` are accepted

Live AWS validation confirmed that the default temperature-only path succeeds with the configured Claude Haiku 4.5 inference profile.
