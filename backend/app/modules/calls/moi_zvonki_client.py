"""Real "Мои звонки" API client (moizvonki.ru), confirmed via a live fetch
of https://www.moizvonki.ru/guide/api/ (2026-07-17).

Used only for the "1 tugma bilan ulash" quick-connect flow. Unlike UTEL,
this provider has no login endpoint at all -- authentication is a
pre-existing `api_key` the tenant copies from their own account settings
(Настройки -> Интеграция), paired with their account email (`user_name`).
Both are used to call `webhook.subscribe` once, registering our own webhook
URL for the `call.finish` event only -- the one event that carries a
complete call record (start/answer/end time, duration, recording -- see
providers.py's MoiZvonkiProvider.parse_event); call.start/call.answer carry
no extra fields and would otherwise create duplicate rows for the same real
call under this app's one-event-per-call ingestion model. Like UTEL, each
account has its own subdomain (confirmed via the docs' own example,
https://test.moizvonki.ru/api/v1), so a `domain` is required, same shape as
utel_client.py's per-tenant host.
"""

import json
import re
import urllib.error
import urllib.request
from asyncio import to_thread

_DOMAIN_RE = re.compile(r"^[a-z0-9-]+$")


class MoiZvonkiApiError(Exception):
    pass


class InvalidMoiZvonkiDomainError(Exception):
    pass


def _base_url(domain: str) -> str:
    domain = domain.strip().lower()
    if not domain or not _DOMAIN_RE.match(domain):
        raise InvalidMoiZvonkiDomainError
    return f"https://{domain}.moizvonki.ru/api/v1"


def _request_sync(url: str, body: dict) -> bytes:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        # Confirmed via the docs: errors come back as a non-200 HTTP status
        # with a description in the body (no separate structured "message"
        # field format is documented, unlike UTEL's Laravel-style errors).
        detail = exc.read().decode(errors="replace")
        raise MoiZvonkiApiError(detail or f"Мои звонки API returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise MoiZvonkiApiError(str(exc.reason)) from exc


async def subscribe_webhook(domain: str, user_name: str, api_key: str, webhook_url: str) -> None:
    """webhook.subscribe -- confirmed request shape:
    {"user_name": ..., "api_key": ..., "action": "webhook.subscribe",
    "hooks": {"call.finish": webhook_url}}. Re-subscribing replaces the
    previous handler for that event (confirmed via the docs), so this is
    safe to call again on reconnect."""
    base_url = _base_url(domain)
    body = {
        "user_name": user_name,
        "api_key": api_key,
        "action": "webhook.subscribe",
        "hooks": {"call.finish": webhook_url},
    }
    await to_thread(_request_sync, base_url, body)
