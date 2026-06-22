# ADR 002: Bounded Context and Retention

## Context

The original API limited the number of historical turns but did not bound the total amount of stored text sent back to Bedrock. It also did not enable retention in the live Terraform root.

The reference should show application-level controls for context size and stored chat lifecycle without pretending to be a tokenizer or a real-time deletion system.

## Decision

Add `MAX_CONTEXT_CHARS` as an approximate character budget for stored history included in Bedrock requests.

The current prompt is always preserved. Historical user/assistant pairs are included as complete turns, keeping the newest contiguous suffix that fits the budget and dropping older turns first when the budget is exceeded. If the newest stored turn itself does not fit, stored history is omitted instead of keeping older context out of order. `system_prompt` remains separate in the Bedrock Converse `system` field.

Add DynamoDB TTL with an `expires_at` epoch-seconds attribute. The Lambda calculates `expires_at` from the request timestamp and `CHAT_RETENTION_DAYS`. Terraform enables TTL on the table.

## Alternatives Considered

- Tokenizer-accurate counting: rejected because this compact reference does not include a model-specific tokenizer and should not imply exact Bedrock token prediction.
- Split partial historical turns: rejected because orphan user or assistant messages can distort conversation context.
- Strict deletion at expiry time: rejected because DynamoDB TTL is asynchronous by design.

## Consequences

Bedrock requests have bounded historical context while preserving the current prompt. Older history may be excluded when stored context exceeds the configured character budget.

Stored turns receive a lifecycle timestamp, but expired records can remain queryable until DynamoDB TTL deletion occurs.

## Operational Implications

`MAX_CONTEXT_CHARS` and `CHAT_RETENTION_DAYS` should be reviewed per environment. These controls reduce accidental context growth and storage duration; they do not enforce hard cost ceilings or immediate deletion.
