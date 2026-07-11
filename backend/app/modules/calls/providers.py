"""CallProvider adapters for UTEL and "Мои звонки".

Neither provider has public API documentation available, so the payload
shapes and signature schemes below are invented-but-plausible placeholders
meant to prove out the adapter architecture (a shared interface + swappable
per-provider implementations, mirroring the CRMProvider pattern used for
AmoCRM/Bitrix24). Replace the parsing/verification logic inside each class
with the real spec once it's available -- nothing outside this module
(service.py, router.py) should need to change, since both only depend on
CallProvider/ParsedCallEvent.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import time
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

    def verify_signature(self, raw_body: bytes, headers: Mapping[str, str], secret: str) -> bool: ...

    def parse_event(self, payload: dict) -> ParsedCallEvent: ...


def _parse_time(value: str | int | float) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    return datetime.fromisoformat(value)


class UtelProvider:
    name = "utel"

    def verify_signature(self, raw_body: bytes, headers: Mapping[str, str], secret: str) -> bool:
        signature = headers.get("x-utel-signature")
        if not signature:
            return False
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)

    def parse_event(self, payload: dict) -> ParsedCallEvent:
        return ParsedCallEvent(
            external_event_id=payload["event_id"],
            external_call_id=payload["call_id"],
            direction=payload["direction"],
            from_number=payload["caller"],
            to_number=payload["callee"],
            started_at=_parse_time(payload["start_time"]),
            ended_at=_parse_time(payload["end_time"]) if payload.get("end_time") else None,
            duration_seconds=int(payload.get("duration_sec", 0)),
            recording_url=payload.get("record_url"),
            external_agent_id=payload.get("agent_ext"),
            status=payload.get("disposition", "unknown"),
        )


class MoiZvonkiProvider:
    """Deliberately uses a different signature scheme (timestamp + base64
    HMAC, with a replay window) than UtelProvider, to prove the CallProvider
    abstraction isn't accidentally shaped around just one provider."""

    name = "moi_zvonki"
    _replay_window_seconds = 300

    def verify_signature(self, raw_body: bytes, headers: Mapping[str, str], secret: str) -> bool:
        timestamp = headers.get("x-mz-timestamp")
        signature = headers.get("x-mz-sign")
        if not timestamp or not signature:
            return False
        try:
            if abs(time.time() - float(timestamp)) > self._replay_window_seconds:
                return False
        except ValueError:
            return False
        message = f"{timestamp}.".encode() + raw_body
        expected = base64.b64encode(hmac.new(secret.encode(), message, hashlib.sha256).digest()).decode()
        return hmac.compare_digest(signature, expected)

    def parse_event(self, payload: dict) -> ParsedCallEvent:
        recording = payload.get("recording") or {}
        hangup_at = payload.get("hangupAt")
        return ParsedCallEvent(
            external_event_id=payload["uid"],
            external_call_id=payload["session_id"],
            direction="inbound" if payload["callDirection"] == "in" else "outbound",
            from_number=payload["from"],
            to_number=payload["to"],
            started_at=_parse_time(payload["answeredAt"]),
            ended_at=_parse_time(hangup_at) if hangup_at else None,
            duration_seconds=int(payload.get("talkTime", 0)),
            recording_url=recording.get("url"),
            external_agent_id=payload.get("operator_code"),
            status=payload.get("result", "unknown"),
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
