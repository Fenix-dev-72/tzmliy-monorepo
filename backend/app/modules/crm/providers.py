"""AmoCRM / Bitrix24 CRMProvider adapters -- mirrors calls/providers.py's
CallProvider shape (Protocol + frozen-dataclass event + name-keyed registry +
get_provider()/UnknownProviderError), but necessarily broader since CRM sync
is bidirectional (inbound webhook + outbound API push), unlike calls' pure
webhook-inbound shape.

Bitrix24's outbound push (crm.lead.add) was confirmed via a live fetch of
apidocs.bitrix24.com. AmoCRM's exact webhook payload/signature scheme and
Bitrix24's exact outgoing-webhook body encoding could NOT be confirmed via a
live fetch in this session (thin/generic search results) -- both providers'
inbound parsing below assumes the well-established, stable
application/x-www-form-urlencoded bracket-notation shape used by the vast
majority of real-world integrations for both platforms. Verify against
amocrm.ru/developers and a real Bitrix24 outgoing-webhook handler during
sandbox onboarding before production use (same caveat style as Faza 7's
UTEL/Мои звонки and Faza 8's Click).
"""

import hmac
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from asyncio import to_thread
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


class UnknownProviderError(Exception):
    pass


class InvalidLeadPayloadError(Exception):
    pass


class CrmApiError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class ParsedLeadEvent:
    external_lead_id: str
    full_name: str
    phone: str
    email: str | None
    stage: str


class CRMProvider(Protocol):
    name: str

    def verify_webhook(
        self, headers: Mapping[str, str], query_params: Mapping[str, str], raw_body: bytes, secret: str | None
    ) -> bool: ...

    def parse_lead_event(self, raw_body: bytes, content_type: str) -> ParsedLeadEvent: ...

    async def push_lead(self, credential: dict, customer: dict) -> str: ...


def _parse_bracket_form(raw_body: bytes) -> dict:
    """Parses application/x-www-form-urlencoded bodies using bracket
    notation (e.g. "leads[status][0][id]=123") into a nested dict, the shape
    both AmoCRM and Bitrix24 use for their classic webhook payloads."""
    parsed = urllib.parse.parse_qs(raw_body.decode("utf-8"))
    result: dict = {}
    for key, values in parsed.items():
        parts = re.findall(r"[^\[\]]+", key)
        node = result
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = values[0]
    return result


def _post_json_sync(url: str, body: dict, headers: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={**headers, "Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read())
    except urllib.error.URLError as exc:
        raise CrmApiError(str(exc.reason)) from exc


# --- AmoCRM -------------------------------------------------------------


class AmoCrmProvider:
    name = "amocrm"

    def verify_webhook(
        self, headers: Mapping[str, str], query_params: Mapping[str, str], raw_body: bytes, secret: str | None
    ) -> bool:
        """AmoCRM's classic webhooks aren't HMAC-signed -- the realistic
        "signed webhook" here is a shared secret the tenant appends as a
        query param on the webhook URL they register in AmoCRM."""
        if secret is None:
            return False
        token = query_params.get("secret", "")
        return hmac.compare_digest(token, secret)

    def parse_lead_event(self, raw_body: bytes, content_type: str) -> ParsedLeadEvent:
        parsed = _parse_bracket_form(raw_body)
        leads = parsed.get("leads", {})
        # "add" (new lead) and "status" (status change) are the two most
        # common event groups AmoCRM sends.
        lead_fields = leads.get("add", {}).get("0") or leads.get("status", {}).get("0")
        if not isinstance(lead_fields, dict) or not lead_fields.get("id"):
            raise InvalidLeadPayloadError("No lead id in AmoCRM payload")

        contacts = parsed.get("contacts", {}).get("add", {}).get("0", {})
        contact_phone = contacts.get("phone") if isinstance(contacts, dict) else None
        phone = contact_phone.get("0", {}).get("value") if isinstance(contact_phone, dict) else None
        if not phone:
            raise InvalidLeadPayloadError("No contact phone in AmoCRM payload")

        return ParsedLeadEvent(
            external_lead_id=str(lead_fields["id"]),
            full_name=lead_fields.get("name") or contacts.get("name") or "AmoCRM Lead",
            phone=phone,
            email=None,
            stage="lead",
        )

    async def push_lead(self, credential: dict, customer: dict) -> str:
        subdomain = credential["external_account_id"]
        url = f"https://{subdomain}.amocrm.ru/api/v4/leads"
        body = [
            {
                "name": customer["full_name"],
                "_embedded": {
                    "contacts": [
                        {
                            "custom_fields_values": [
                                {"field_code": "PHONE", "values": [{"value": customer["phone"], "enum_code": "WORK"}]}
                            ]
                        }
                    ]
                },
            }
        ]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        result = await to_thread(_post_json_sync, url, body, headers)
        try:
            return str(result["_embedded"]["leads"][0]["id"])
        except (KeyError, IndexError, TypeError) as exc:
            raise CrmApiError(f"Unexpected AmoCRM response: {result}") from exc


# --- Bitrix24 -------------------------------------------------------------


class Bitrix24Provider:
    name = "bitrix24"

    def verify_webhook(
        self, headers: Mapping[str, str], query_params: Mapping[str, str], raw_body: bytes, secret: str | None
    ) -> bool:
        if secret is None:
            return False
        parsed = _parse_bracket_form(raw_body)
        token = parsed.get("auth", {}).get("application_token", "")
        return hmac.compare_digest(token, secret)

    def parse_lead_event(self, raw_body: bytes, content_type: str) -> ParsedLeadEvent:
        parsed = _parse_bracket_form(raw_body)
        fields = parsed.get("data", {}).get("FIELDS", {})
        if not isinstance(fields, dict) or not fields.get("ID"):
            raise InvalidLeadPayloadError("No lead id in Bitrix24 payload")
        phone = fields.get("PHONE")
        if not phone:
            raise InvalidLeadPayloadError("No phone in Bitrix24 payload")
        return ParsedLeadEvent(
            external_lead_id=str(fields["ID"]),
            full_name=fields.get("TITLE") or fields.get("NAME") or "Bitrix24 Lead",
            phone=phone,
            email=fields.get("EMAIL"),
            stage="lead",
        )

    async def push_lead(self, credential: dict, customer: dict) -> str:
        # api_key_encrypted holds the full incoming-webhook base URL for
        # Bitrix24 -- the URL itself is the credential, per Bitrix24's design.
        webhook_base_url = credential["api_key_encrypted"].rstrip("/")
        url = f"{webhook_base_url}/crm.lead.add.json"
        body = {
            "fields": {
                "TITLE": customer["full_name"],
                "NAME": customer["full_name"],
                "PHONE": [{"VALUE": customer["phone"], "VALUE_TYPE": "WORK"}],
            }
        }
        result = await to_thread(_post_json_sync, url, body, {})
        if "result" not in result:
            raise CrmApiError(f"Unexpected Bitrix24 response: {result}")
        return str(result["result"])


_PROVIDERS: dict[str, CRMProvider] = {"amocrm": AmoCrmProvider(), "bitrix24": Bitrix24Provider()}


def get_provider(name: str) -> CRMProvider:
    provider = _PROVIDERS.get(name)
    if provider is None:
        raise UnknownProviderError
    return provider
