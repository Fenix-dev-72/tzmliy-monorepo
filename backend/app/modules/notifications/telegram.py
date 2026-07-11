"""Telegram Bot API client — plain `urllib.request` + `asyncio.to_thread`,
matching `calls/providers.py`'s `download_recording` (no async HTTP client
dependency exists in this repo)."""

import json
import urllib.error
import urllib.request
import uuid
from asyncio import to_thread

_API_BASE = "https://api.telegram.org"


class TelegramApiError(Exception):
    def __init__(self, error_code: int | None, description: str):
        self.error_code = error_code
        self.description = description
        super().__init__(f"Telegram API error {error_code}: {description}")


def _parse_response(raw: bytes) -> dict:
    body = json.loads(raw)
    if not body.get("ok"):
        raise TelegramApiError(body.get("error_code"), body.get("description", "Unknown error"))
    return body["result"]


def _post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return _parse_response(resp.read())
    except urllib.error.HTTPError as exc:
        return _parse_response(exc.read())


def _encode_multipart(fields: dict[str, str], file_field: str, filename: str, file_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        parts.append(f"{value}\r\n".encode())
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode())
    parts.append(f"Content-Type: {content_type}\r\n\r\n".encode())
    parts.append(file_bytes)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _post_multipart(url: str, fields: dict[str, str], file_field: str, filename: str, file_bytes: bytes, content_type: str) -> dict:
    body, content_type_header = _encode_multipart(fields, file_field, filename, file_bytes, content_type)
    req = urllib.request.Request(url, data=body, headers={"Content-Type": content_type_header}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return _parse_response(resp.read())
    except urllib.error.HTTPError as exc:
        return _parse_response(exc.read())


def _send_message_sync(bot_token: str, chat_id: int, text: str) -> dict:
    return _post_json(f"{_API_BASE}/bot{bot_token}/sendMessage", {"chat_id": chat_id, "text": text})


def _send_document_sync(bot_token: str, chat_id: int, filename: str, data: bytes, caption: str | None) -> dict:
    fields = {"chat_id": str(chat_id)}
    if caption:
        fields["caption"] = caption
    return _post_multipart(
        f"{_API_BASE}/bot{bot_token}/sendDocument", fields, "document", filename, data, "application/pdf"
    )


async def send_message(bot_token: str, chat_id: int, text: str) -> dict:
    return await to_thread(_send_message_sync, bot_token, chat_id, text)


async def send_document(bot_token: str, chat_id: int, filename: str, data: bytes, caption: str | None = None) -> dict:
    return await to_thread(_send_document_sync, bot_token, chat_id, filename, data, caption)
