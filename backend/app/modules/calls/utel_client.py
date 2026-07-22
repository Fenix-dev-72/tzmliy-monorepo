"""Real UTEL API client.

UTEL's OpenAPI spec was confirmed via a live fetch of https://api.dev.utel.uz/docs/api
(2026-07-17), but that host turned out to be UTEL's *own* internal sandbox --
a real tenant's credentials live on a **per-company API subdomain** instead:
`https://api.{subdomain}.utel.uz/api`, where `subdomain` is the same code
that appears in that company's UTEL dashboard URL (e.g. a company whose
dashboard is at `https://cc341.utel.uz/dashboard` has its API at
`https://api.cc341.utel.uz/api` -- confirmed live, 2026-07-17, by reading
that dashboard's own `runtime-env.js`, which the Vue SPA loads at runtime to
learn its own API base URL: `{"VITE_VUE_APP_API_ENDPOINT":
"https://api.cc341.utel.uz/api", ...}`). The route shapes/schemas
(login, webhook registration) are identical to what the sandbox spec
documents -- only the host differs per tenant.

Used only for the "1 tugma bilan ulash" quick-connect flow: log in with the
tenant's own UTEL email+password (POST /v1/auth/login -- Bearer auth,
confirmed via the spec's securitySchemes) to get a token, then register our
own webhook URL via UTEL's real PUT /v1/integration/webhook. The email and
password are only ever held in memory for this one call and are never
persisted -- same "don't store what you don't have to" posture as every
other credential in this app.
"""

import json
import re
import urllib.error
import urllib.request
from asyncio import to_thread

_SUBDOMAIN_RE = re.compile(r"^[a-z0-9-]+$")


class UtelApiError(Exception):
    pass


class InvalidUtelSubdomainError(Exception):
    pass


def _base_url(subdomain: str) -> str:
    subdomain = subdomain.strip().lower()
    if not subdomain or not _SUBDOMAIN_RE.match(subdomain):
        raise InvalidUtelSubdomainError
    return f"https://api.{subdomain}.utel.uz/api/v1"


def _error_message(raw: bytes, fallback: str) -> str:
    """UTEL is a Laravel app -- its structured validation/auth errors come
    back as {"message": "...", "errors": {...}}. Surface that message
    directly instead of dumping the raw JSON at the admin."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and isinstance(parsed.get("message"), str):
            return parsed["message"]
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass
    return raw.decode(errors="replace") or fallback


def _request_sync(method: str, url: str, body: dict, headers: dict) -> bytes:
    # Accept: application/json is required -- without it, Laravel/Sanctum
    # falls back to serving an HTML page (even on bad credentials) instead
    # of a JSON error, confirmed by a live probe against this exact endpoint
    # (2026-07-17): the same POST with no Accept header returned a 200 HTML
    # "Welcome to Utel" page; adding this header turned it into the correct
    # structured 422 validation error.
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise UtelApiError(_error_message(exc.read(), f"UTEL API returned HTTP {exc.code}")) from exc
    except urllib.error.URLError as exc:
        raise UtelApiError(str(exc.reason)) from exc


def _extract_token(raw: bytes) -> str | None:
    """The sandbox spec (api.dev.utel.uz) declares this endpoint's success
    response as a bare JSON string -- confirmed wrong against a real
    successful login on a real per-tenant host (2026-07-17): production
    actually replies
    {"status":"success","code":200,"result":{"access_token":"4|xT42..."},"message":"..."}.
    Checked first; the other shapes below stay as a defensive fallback in
    case a different tenant/version of the API responds differently."""
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        text = raw.decode(errors="replace").strip().strip('"')
        return text or None
    if isinstance(parsed, str) and parsed:
        return parsed
    if isinstance(parsed, dict):
        result = parsed.get("result")
        if isinstance(result, dict):
            token = result.get("access_token") or result.get("token")
            if isinstance(token, str) and token:
                return token
        for key in ("token", "access_token", "accessToken", "data"):
            value = parsed.get(key)
            if isinstance(value, str) and value:
                return value
            if isinstance(value, dict):
                nested = value.get("token") or value.get("access_token")
                if isinstance(nested, str) and nested:
                    return nested
    return None


async def login(subdomain: str, email: str, password: str) -> str:
    """POST /v1/auth/login."""
    base_url = _base_url(subdomain)
    raw = await to_thread(_request_sync, "POST", f"{base_url}/auth/login", {"email": email, "password": password}, {})
    token = _extract_token(raw)
    if not token:
        # Include a truncated, redacted-enough snippet of the real response
        # so a repeat failure reports the actual shape instead of forcing
        # another blind guess.
        raise UtelApiError(f"Unexpected login response from UTEL: {raw[:300]!r}")
    return token


async def register_webhook(subdomain: str, bearer_token: str, webhook_url: str) -> None:
    """PUT /v1/integration/webhook -- the "*" key is literal (confirmed via
    the live spec's StoreWebhookRequest schema): UTEL scopes webhook config
    per-extension, "*" means "every extension/line". Only call_started/
    call_ended are enabled -- the dial_*/call_transferred/call_saved
    sub-events aren't consumed by this app's single-event ingestion model
    (calls/service.py's ingest_webhook expects one event carrying the whole
    call record, mirroring UtelProvider.parse_event)."""
    body = {
        "*": {
            "url": webhook_url,
            "call_started": True,
            "call_ended": True,
            "dial_started": False,
            "dial_answered": False,
            "dial_ended": False,
            "call_transferred": False,
            "call_saved": False,
        }
    }
    base_url = _base_url(subdomain)
    await to_thread(
        _request_sync, "PUT", f"{base_url}/integration/webhook", body, {"Authorization": f"Bearer {bearer_token}"}
    )
