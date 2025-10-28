import os
import json
import time
import uuid
import boto3

dynamodb = boto3.resource("dynamodb")
CHAT_TABLE = os.environ.get("CHAT_TABLE")
table = dynamodb.Table(CHAT_TABLE) if CHAT_TABLE else None

def _resp(status, body=None):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body or {}),
    }

def handler(event, context):
    http = (event or {}).get("requestContext", {}).get("http", {})
    method = http.get("method", "GET")
    path = event.get("rawPath", "/")

    if method == "GET" and path == "/health":
        return _resp(200, {"status":"ok","service":"aws-genai-starter"})

    if method == "POST" and path == "/chat":
        if table is None:
            return _resp(500, {"error": "CHAT_TABLE not configured"})
        try:
            body = event.get("body") or "{}"
            payload = json.loads(body)
            session_id = payload.get("session_id") or str(uuid.uuid4())
            prompt = (payload.get("prompt") or "").strip()
            if not prompt:
                return _resp(400, {"error":"Missing 'prompt'"})
            reply = f"Echo: {prompt}"  # placeholder (sustituiremos por Bedrock)
            now_ms = int(time.time() * 1000)
            item = {
                "session_id": session_id,
                "timestamp": now_ms,
                "prompt": prompt,
                "response": reply,
                "model_id": "placeholder"
            }
            table.put_item(Item=item)
            return _resp(200, {"session_id": session_id, "timestamp": now_ms, "response": reply})
        except Exception as e:
            return _resp(500, {"error": str(e)})

    if method == "OPTIONS":
        return _resp(200, {})

    return _resp(404, {"error":"Not Found"})