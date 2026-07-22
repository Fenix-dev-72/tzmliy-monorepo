"""CallProvider adapters for UTEL and "Мои звонки".

UTEL's real API was confirmed via a live fetch of its OpenAPI spec
(https://api.dev.utel.uz/docs/api, 2026-07-17) -- see calls/utel_client.py
for the parts of that API this app actually calls (login + webhook
registration). That spec documents UTEL's *own* inbound REST API in full,
but does not document the JSON body shape of the webhooks *it* sends out to
subscribers -- UtelProvider.parse_event below is therefore still a
best-effort inference, now aligned to the field vocabulary confirmed real by
GET /v1/call-history's CallHistoryIndexResource (call_id, src, dst,
date_time, duration, recorded_file_url) rather than invented from scratch --
verify field names against a real webhook delivery once one arrives, same
"replace once the real spec/sample is available" note as before.

"Мои звонки"'s real API was confirmed via a live fetch of
https://www.moizvonki.ru/guide/api/ (2026-07-17) -- see calls/moi_zvonki_client.py
for the webhook-subscribe call this app makes. Unlike UTEL, that page fully
documents both the subscribe request *and* the exact webhook payload shape
(with a real example), so MoiZvonkiProvider.parse_event below is not a guess
-- it matches the documented `{"webhook": {...}, "event": {...}}` structure
exactly. There is no signature/verification scheme documented for its
webhooks at all, so -- same as UTEL -- verification is a shared-secret query
param this app embeds itself when subscribing.
"""

from __future__ import annotations

import asyncio
import hmac
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol


@dataclass(frozen=True)
class ParsedCallEvent:
    external_event_id: str
    external_call_id: str
    direction: str
    from_number: str
    to_number: str
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int
    recording_url: str | None
    external_agent_id: str | None
    status: str


class CallProvider(Protocol):
    name: str

    def verify_signature(
        self, raw_body: bytes, headers: Mapping[str, str], query_params: Mapping[str, str], secret: str
    ) -> bool: ...

    def parse_event(self, payload: dict) -> ParsedCallEvent: ...


def _parse_time(value: str | int | float) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    return datetime.fromisoformat(value)


class UtelProvider:
    name = "utel"

    def verify_signature(
        self, raw_body: bytes, headers: Mapping[str, str], query_params: Mapping[str, str], secret: str
    ) -> bool:
        # UTEL's real webhook-registration API (PUT /v1/integration/webhook,
        # confirmed live) lets *us* choose the URL it delivers to -- same
        # shape as AmoCRM's inbound webhook, so verification is a plain
        # shared-secret query param we embed ourselves at registration time
        # (calls/utel_client.py's register_webhook), not a signature scheme
        # UTEL computes on its side (nothing in its spec documents one).
        received = query_params.get("secret")
        if not received:
            return False
        return hmac.compare_digest(received, secret)

    def parse_event(self, payload: dict) -> ParsedCallEvent:
        # Field names aligned to GET /v1/call-history's confirmed-real
        # CallHistoryIndexResource vocabulary (call_id/src/dst/date_time/
        # duration/recorded_file_url) -- the *webhook* body shape itself
        # isn't in UTEL's public spec, so this is still an inference, just a
        # much better-grounded one than before. Verify against a real
        # delivery (visible via GET /v1/integration/webhook/history on
        # UTEL's side) once a tenant actually connects.
        status = payload.get("status")
        status_name = status.get("name") if isinstance(status, dict) else status
        # Security/correctness audit fix (2026-07-18): this used to fall back
        # to bare `call_id` when UTEL's payload has no `event_id` field --
        # since this app subscribes to both call_started and call_ended for
        # the same call (calls/utel_client.py's register_webhook), and both
        # deliveries share one call_id (and, per parse_event below, the same
        # date_time), a bare call_id fallback made the two events collide on
        # external_event_id. claim_webhook_event's dedup gate then silently
        # dropped the *second* delivery as a duplicate before it ever reached
        # insert_call -- call_ended (the one carrying real duration/
        # recording) was the one usually lost, since it always arrives after
        # call_started. Suffixing with whether `duration` is present (UTEL's
        # own signal for "this is the ended event," per the call-history
        # vocabulary this module already keys off) keeps the two distinct.
        event_phase = "ended" if payload.get("duration") is not None else "started"
        return ParsedCallEvent(
            external_event_id=payload.get("event_id") or f"{payload['call_id']}:{event_phase}",
            external_call_id=payload["call_id"],
            direction=payload.get("direction", "inbound"),
            from_number=payload["src"],
            to_number=payload["dst"],
            started_at=_parse_time(payload["date_time"]),
            ended_at=_parse_time(payload["date_time"]) if payload.get("duration") is not None else None,
            duration_seconds=int(payload.get("duration") or 0),
            recording_url=payload.get("recorded_file_url") or None,
            external_agent_id=payload.get("external_number"),
            status=status_name or "unknown",
        )


class MoiZvonkiProvider:
    name = "moi_zvonki"

    def verify_signature(
        self, raw_body: bytes, headers: Mapping[str, str], query_params: Mapping[str, str], secret: str
    ) -> bool:
        # No signature scheme is documented for Мои звонки's webhooks
        # (confirmed via the live docs) -- verification is a shared-secret
        # query param this app embeds itself when subscribing
        # (moi_zvonki_client.py's subscribe_webhook), same reasoning as
        # UTEL's above.
        received = query_params.get("secret")
        if not received:
            return False
        return hmac.compare_digest(received, secret)

    def parse_event(self, payload: dict) -> ParsedCallEvent:
        # Confirmed real shape (https://www.moizvonki.ru/guide/api/,
        # 2026-07-17): {"webhook": {"action", "user_id", "user_login", ...},
        # "event": {"direction", "client_number", "src_number", "start_time",
        # "end_time", "duration", "answered", "recording", "db_call_id",
        # "event_pbx_call_id", ...}}. This app only ever subscribes to
        # call.finish (see moi_zvonki_client.py) -- the one event carrying a
        # complete record; call.start/call.answer add no extra fields per
        # the docs and would otherwise create duplicate rows for one real
        # call under this app's one-event-per-call ingestion model.
        webhook_meta = payload.get("webhook") or {}
        event = payload["event"]
        is_outbound = event.get("direction") == 1
        agent_number = event.get("src_number") or ""
        client_number = event["client_number"]
        end_time = event.get("end_time")
        return ParsedCallEvent(
            external_event_id=str(event["db_call_id"]),
            external_call_id=str(event.get("db_call_id") or event["event_pbx_call_id"]),
            direction="outbound" if is_outbound else "inbound",
            from_number=agent_number if is_outbound else client_number,
            to_number=client_number if is_outbound else agent_number,
            started_at=_parse_time(event["start_time"]),
            ended_at=_parse_time(end_time) if end_time else None,
            duration_seconds=int(event.get("duration") or 0),
            recording_url=event.get("recording") or None,
            external_agent_id=webhook_meta.get("user_login"),
            status="answered" if event.get("answered") == 1 else "no_answer",
        )


class UnknownProviderError(Exception):
    pass


_PROVIDERS: dict[str, CallProvider] = {
    "utel": UtelProvider(),
    "moi_zvonki": MoiZvonkiProvider(),
}


def get_provider(name: str) -> CallProvider:
    provider = _PROVIDERS.get(name)
    if provider is None:
        raise UnknownProviderError
    return provider


def _download_sync(url: str, timeout: float) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


async def download_recording(url: str, timeout: float = 10.0) -> bytes:
    """A separate, mockable function so a smoke test (or future unit test)
    can monkeypatch it instead of needing a real provider to fetch from."""
    return await asyncio.to_thread(_download_sync, url, timeout)
