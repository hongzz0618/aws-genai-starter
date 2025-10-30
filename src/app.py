import os
import json
import time
import uuid
import boto3

# --- Configuración/env vars ---
CHAT_TABLE     = os.environ.get("CHAT_TABLE")  # DynamoDB table con PK: session_id, SK: timestamp (Number)
AWS_REGION     = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
MODEL_ID       = os.environ.get("MODEL_ID", "us.anthropic.claude-3-5-sonnet-20241022-v2:0")
HISTORY_TURNS  = int(os.environ.get("HISTORY_TURNS", "10"))
MAX_TOKENS     = int(os.environ.get("MAX_TOKENS", "1024"))
TEMPERATURE    = float(os.environ.get("TEMPERATURE", "0.2"))
TOP_P          = float(os.environ.get("TOP_P", "1"))

# --- Clientes AWS ---
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(CHAT_TABLE) if CHAT_TABLE else None
bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)  # Converse/ConverseStream

def _resp(status, body=None):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body or {}, ensure_ascii=False),
    }

def _query_history_messages(session_id: str, limit: int):
    """
    Recupera los últimos 'limit' items de la sesión y los convierte en mensajes para Converse:
    cada item contiene {prompt, response} -> se traduce a [user, assistant].
    """
    if table is None:
        return []

    # Trae por orden ascendente (más antiguo -> más reciente)
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("session_id").eq(session_id),
        ScanIndexForward=True,
        Limit=max(limit, 1) * 50
    )
    items = resp.get("Items", [])

    messages = []
    for it in items[-limit:]:
        p = (it.get("prompt") or "").strip()
        r = (it.get("response") or "").strip()
        if p:
            messages.append({"role": "user", "content": [{"text": p}]})
        if r:
            messages.append({"role": "assistant", "content": [{"text": r}]})
    return messages

def handler(event, context):
    http = (event or {}).get("requestContext", {}).get("http", {})
    method = http.get("method", "GET")
    path = event.get("rawPath", "/")

    if method == "GET" and path == "/health":
        return _resp(200, {"status": "ok", "service": "aws-genai-starter"})

    if method == "POST" and path == "/chat":
        if table is None:
            return _resp(500, {"error": "CHAT_TABLE not configured"})
        try:
            body = event.get("body") or "{}"
            payload = json.loads(body)

            session_id = payload.get("session_id") or str(uuid.uuid4())
            prompt     = (payload.get("prompt") or "").strip()
            if not prompt:
                return _resp(400, {"error": "Missing 'prompt'"})

            system_prompt = (payload.get("system_prompt") or "").strip()
            model_id      = payload.get("model_id") or MODEL_ID
            history_turns = int(payload.get("history_turns") or HISTORY_TURNS)
            max_tokens    = int(payload.get("max_tokens")    or MAX_TOKENS)
            temperature   = float(payload.get("temperature")  or TEMPERATURE)
            top_p         = float(payload.get("top_p")        or TOP_P)

            # Construye mensajes: historial + turno actual
            messages = _query_history_messages(session_id, history_turns)
            messages.append({"role": "user", "content": [{"text": prompt}]})

            # Arma la request para Converse
            req = {
                "modelId": model_id,
                "messages": messages,
                "inferenceConfig": {
                    "maxTokens": max_tokens,
                    "temperature": temperature,
                    "topP": top_p
                }
            }
            if system_prompt:
                req["system"] = [{"text": system_prompt}]

            # Llamada a Bedrock (Converse)
            resp = bedrock.converse(**req)

            # Extrae texto de salida
            out = ""
            try:
                out = resp["output"]["message"]["content"][0]["text"]
            except Exception:
                out = ""

            # Guarda el turno (prompt+respuesta) en la tabla
            now_ms = int(time.time() * 1000)
            item = {
                "session_id": session_id,
                "timestamp": now_ms,
                "prompt": prompt,
                "response": out,
                "model_id": model_id,
            }
            usage = resp.get("usage") or {}
            if "inputTokens" in usage:
                item["input_tokens"] = int(usage["inputTokens"])
            if "outputTokens" in usage:
                item["output_tokens"] = int(usage["outputTokens"])

            table.put_item(Item=item)

            return _resp(200, {
                "session_id": session_id,
                "timestamp": now_ms,
                "response": out,
                "usage": usage,
                "stopReason": resp.get("stopReason")
            })

        except Exception as e:
            # Regresa detalle del error para depurar en primeras fases
            return _resp(500, {"error": "Bedrock call failed", "detail": str(e)})

    if method == "OPTIONS":
        return _resp(200, {})

    return _resp(404, {"error": "Not Found"})