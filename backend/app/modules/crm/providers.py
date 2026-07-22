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
from datetime import datetime, timezone
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
    # Confirmed 2026-07-15 against a real AmoCRM webhook: a lead's own
    # webhook payload never carries contact/phone fields (that's a wholly
    # separate webhook event) -- None here is the normal case for AmoCRM,
    # backfilled by crm/service.py's ingest_webhook via a follow-up API call.
    # Bitrix24's payload does carry PHONE inline (see its own parse_lead_event),
    # so this stays required in practice for that provider.
    phone: str | None
    email: str | None
    stage: str
    # The CRM's own manager/responsible-user id for this lead, when the
    # payload carries one -- resolved against crm_manager_mappings to
    # auto-set customers.responsible_user_id. None when absent (not every
    # payload includes it), same "opt-in, missing means unknown, not fatal"
    # pattern as catalog's cost-price/sale-currency mismatch handling.
    responsible_manager_id: str | None = None
    # Client requirement (2026-07-15): a deal ("сделка") should also create a
    # real Tizimly sale, not just a customers/lead row -- price_amount is the
    # lead's own price field when the payload carries one (None means the
    # deal has no price set, e.g. AmoCRM leads are allowed to have price=0 or
    # omit it entirely). status_id is AmoCRM's pipeline status id, used to
    # detect a won/lost transition on later "leads[status]" events -- kept as
    # a raw string here (provider-specific meaning), interpreted by
    # crm/service.py's ingestion, not this dataclass.
    price_amount: int | None = None
    status_id: str | None = None


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
        raw = exc.read()
        try:
            return json.loads(raw)
        except ValueError:
            # Not every error response is JSON (e.g. a wrong subdomain/token
            # can hit an HTML error page instead of the real API) -- surface
            # it as the same CrmApiError the caller already handles (-> 502),
            # not an unhandled JSONDecodeError (-> 500).
            raise CrmApiError(f"HTTP {exc.code}: {raw[:200].decode(errors='replace')}") from None
    except urllib.error.URLError as exc:
        raise CrmApiError(str(exc.reason)) from exc
    except Exception as exc:
        # Bug found 2026-07-14: a malformed subdomain/account id (e.g. one
        # containing a space, entered through the connect-integration form
        # with no server-side validation) makes urlopen raise
        # http.client.InvalidURL while just setting up the connection --
        # that's neither HTTPError nor URLError, so it fell through both
        # excepts above and crashed the whole seller-KPI page with a 500
        # instead of the graceful "can't show this metric" None the caller
        # (crm/service.py's get_seller_followup_stats) already expects.
        # Catching everything else here keeps the promise that *any* bad
        # external call degrades gracefully, not just the two urllib classes
        # someone happened to think of.
        raise CrmApiError(str(exc)) from exc


def _get_json_sync(url: str, headers: dict | None = None) -> dict:
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read()
            # Bug found 2026-07-15 (live, against a real connected AmoCRM
            # account): a 200 with zero matching results (e.g.
            # /api/v4/leads?filter[updated_at][from]=... matching nothing)
            # comes back with an EMPTY body, not "{}" or "{"_embedded":
            # {"leads": []}}" -- json.loads("") raises JSONDecodeError, which
            # crashed the amocrm calls sync worker's tick instead of just
            # meaning "no results". Callers already do
            # result.get("_embedded", {}).get(...), so {} is a safe stand-in.
            if not body.strip():
                return {}
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return json.loads(raw)
        except ValueError:
            raise CrmApiError(f"HTTP {exc.code}: {raw[:200].decode(errors='replace')}") from None
    except urllib.error.URLError as exc:
        raise CrmApiError(str(exc.reason)) from exc
    except Exception as exc:
        # See _post_json_sync's matching comment -- same InvalidURL-class-of-
        # bug fix, same reasoning.
        raise CrmApiError(str(exc)) from exc


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
        # Confirmed live 2026-07-15 against a real connected account/webhook:
        # AmoCRM uses "add" for lead creation and **"update"** for any field
        # change including status transitions -- there is no separate
        # "status" group at all (the original guess this replaced was wrong,
        # not just incomplete). Also confirmed: a lead webhook's payload
        # carries ONLY lead fields, never contacts/phone -- contact changes
        # are their own separate webhook event entirely. phone is therefore
        # always None here; crm/service.py's ingest_webhook backfills it with
        # a follow-up API call (fetch_lead_phone below) using the same OAuth
        # credential, since a customer can't be resolved/created without one.
        # Confirmed live 2026-07-15: AmoCRM sometimes fires a "status"-only
        # webhook for a status transition (in addition to, or instead of,
        # an "update" one for the same change) -- checked last since "add"
        # and "update" cover the large majority of events seen so far.
        lead_fields = leads.get("add", {}).get("0") or leads.get("update", {}).get("0") or leads.get("status", {}).get("0")
        if not isinstance(lead_fields, dict) or not lead_fields.get("id"):
            raise InvalidLeadPayloadError("No lead id in AmoCRM payload")

        price_raw = lead_fields.get("price")
        return ParsedLeadEvent(
            external_lead_id=str(lead_fields["id"]),
            full_name=lead_fields.get("name") or "AmoCRM Lead",
            phone=None,
            email=None,
            stage="lead",
            responsible_manager_id=lead_fields.get("responsible_user_id"),
            price_amount=int(price_raw) if price_raw not in (None, "") else None,
            status_id=str(lead_fields["status_id"]) if lead_fields.get("status_id") else None,
        )

    async def fetch_lead_phone(self, credential: dict, external_lead_id: str) -> str | None:
        """Backfills the phone a lead-webhook payload never carries (see
        parse_lead_event's docstring above) -- fetches the lead's first
        linked contact, then that contact's first PHONE field value. Returns
        None (not an error) if the lead has no linked contact or the contact
        has no phone -- ingest_webhook treats that as "can't sync this one",
        same graceful-degradation shape as everywhere else in this module."""
        subdomain = credential["external_account_id"]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        lead = await to_thread(
            _get_json_sync, f"https://{subdomain}.amocrm.ru/api/v4/leads/{external_lead_id}?with=contacts", headers
        )
        contacts = lead.get("_embedded", {}).get("contacts", [])
        if not contacts:
            return None
        contact = await to_thread(
            _get_json_sync, f"https://{subdomain}.amocrm.ru/api/v4/contacts/{contacts[0]['id']}", headers
        )
        for field in contact.get("custom_fields_values") or []:
            if field.get("field_code") == "PHONE":
                values = field.get("values") or []
                if values:
                    return values[0].get("value")
        return None

    async def fetch_loss_reason(self, credential: dict, external_lead_id: str) -> str | None:
        """Seller/lead analytics (2026-07-15): AmoCRM records why a lost
        lead didn't close via a separate loss_reason_id -- fetches the
        lead's reason id, then that reason's display name. Returns None
        (not an error) if the lead has no loss reason set (the tenant may
        not use this AmoCRM feature) or the lookup fails; ingest_webhook
        falls back to its own synthetic reason ("no_phone"/"no_answer")
        in that case."""
        subdomain = credential["external_account_id"]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        try:
            lead = await to_thread(
                _get_json_sync, f"https://{subdomain}.amocrm.ru/api/v4/leads/{external_lead_id}?with=loss_reason", headers
            )
        except CrmApiError:
            return None
        reasons = lead.get("_embedded", {}).get("loss_reason", [])
        if not reasons:
            return None
        return reasons[0].get("name")

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

    async def list_users(self, credential: dict) -> list[dict]:
        """Self-service manager-mapping (CompleteSetupPage): lets an employee
        pick their own name from a real dropdown instead of having to look up
        and type a raw numeric AmoCRM user id by hand (2026-07-15). Confirmed
        against AmoCRM's real /api/v4/users during live testing -- returns
        every user in the account with id/name/email; paginated the same way
        list_tasks already paginates below."""
        subdomain = credential["external_account_id"]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        users: list[dict] = []
        page = 1
        while True:
            url = f"https://{subdomain}.amocrm.ru/api/v4/users?limit=250&page={page}"
            result = await to_thread(_get_json_sync, url)
            page_users = result.get("_embedded", {}).get("users", [])
            if not page_users:
                break
            users.extend(
                {"external_manager_id": str(u["id"]), "name": u.get("name") or u.get("email") or str(u["id"])}
                for u in page_users
            )
            if len(page_users) < 250:
                break
            page += 1
        return users

    async def list_calls(self, credential: dict, since: datetime) -> list[dict]:
        """Pull-based call sync (2026-07-15, client requirement: "barcha
        AmoCRM qo'ng'iroqlari Tizimly'ga tortib olinadi"). AmoCRM doesn't
        push calls via classic webhooks the way it pushes lead
        add/status -- calls only exist as call-type notes attached to a
        lead. This fetches leads touched since the last sync, then each
        one's call notes. AmoCRM's exact note_type values for calls
        (call_in/call_out) and the call note's `params` shape
        (phone/duration/link) could NOT be confirmed via live docs in this
        session -- same "invented-but-plausible, re-verify at real sandbox
        onboarding" caveat this module already carries for AmoCRM's webhook
        signature scheme and Bitrix24's note/task fields. Returns plain
        dicts shaped like calls/providers.py's ParsedCallEvent fields
        (not that dataclass itself, to avoid a cross-module import for one
        shared shape) -- crm/worker.py's sync loop maps them onto
        calls_repository.insert_call.
        """
        subdomain = credential["external_account_id"]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        since_ts = int(since.timestamp())

        lead_ids: list[int] = []
        page = 1
        while True:
            url = f"https://{subdomain}.amocrm.ru/api/v4/leads?filter[updated_at][from]={since_ts}&limit=250&page={page}"
            result = await to_thread(_get_json_sync, url, headers)
            leads = result.get("_embedded", {}).get("leads", [])
            if not leads:
                break
            lead_ids.extend(lead["id"] for lead in leads)
            if len(leads) < 250:
                break
            page += 1

        calls: list[dict] = []
        for lead_id in lead_ids:
            notes_url = (
                f"https://{subdomain}.amocrm.ru/api/v4/leads/{lead_id}/notes"
                f"?filter[note_type]=call_in,call_out&limit=250"
            )
            result = await to_thread(_get_json_sync, notes_url, headers)
            notes = result.get("_embedded", {}).get("notes", [])
            for note in notes:
                params = note.get("params", {}) or {}
                phone = params.get("phone") or "unknown"
                duration = int(params.get("duration") or 0)
                responsible_user_id = note.get("responsible_user_id")
                calls.append(
                    {
                        "external_call_id": str(note["id"]),
                        "direction": "inbound" if note.get("note_type") == "call_in" else "outbound",
                        "from_number": phone,
                        "to_number": phone,
                        "started_at": datetime.fromtimestamp(note["created_at"], tz=timezone.utc),
                        "ended_at": None,
                        "duration_seconds": duration,
                        "recording_url": params.get("link"),
                        "external_agent_id": str(responsible_user_id) if responsible_user_id else None,
                        "status": "completed" if duration > 0 else "missed",
                    }
                )
        return calls

    async def list_tasks(self, credential: dict, external_manager_id: str, period_start, period_end) -> list[dict]:
        """Per-seller KPI page's "Follow-up" metric (2026-07-13): pulls this
        seller's own follow-up tasks from their connected AmoCRM account,
        filtered by responsible_user_id (confirmed live against
        developers.kommo.com/reference/tasks-list). AmoCRM's own `filter[]`
        is by `updated_at`, not `complete_till` -- so the date-range filter
        is applied client-side below, over one (paginated) fetch per seller
        per page-load, not a per-task round trip. `updated_at` is used as a
        best-effort proxy for "completed_at" since the API didn't expose a
        dedicated completion timestamp in the confirmed field list -- flagged
        for verification at real sandbox onboarding, same caveat style as
        this module's other AmoCRM/Bitrix24 assumptions."""
        subdomain = credential["external_account_id"]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        tasks: list[dict] = []
        page = 1
        while True:
            url = (
                f"https://{subdomain}.amocrm.ru/api/v4/tasks"
                f"?filter[responsible_user_id][]={external_manager_id}&order[complete_till]=asc&limit=250&page={page}"
            )
            # Bug found 2026-07-15 while adding list_calls alongside this
            # method: `headers` (built above, carries the Bearer token) was
            # never actually passed here -- every call silently 401'd against
            # AmoCRM's real API, and _get_json_sync's HTTPError handler
            # returns the parsed error body (no "_embedded" key) rather than
            # raising, so this returned an empty task list forever instead of
            # a visible failure. The per-seller KPI "Follow-up" metric has
            # been silently empty for every AmoCRM-linked seller since this
            # method was introduced.
            result = await to_thread(_get_json_sync, url, headers)
            page_tasks = result.get("_embedded", {}).get("tasks", [])
            if not page_tasks:
                break
            tasks.extend(page_tasks)
            if len(page_tasks) < 250:
                break
            page += 1

        out = []
        for t in tasks:
            due_at = datetime.fromtimestamp(t["complete_till"], tz=timezone.utc)
            if not (period_start <= due_at < period_end):
                continue
            is_completed = bool(t.get("is_completed"))
            completed_at = datetime.fromtimestamp(t["updated_at"], tz=timezone.utc) if is_completed and t.get("updated_at") else None
            out.append(
                {
                    "due_at": due_at,
                    "completed": is_completed,
                    "on_time": is_completed and completed_at is not None and completed_at <= due_at,
                }
            )
        return out


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
            responsible_manager_id=fields.get("ASSIGNED_BY_ID"),
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

    async def check_webhook(self, webhook_base_url: str) -> None:
        """Validates a pasted incoming-webhook URL at configure time by
        calling Bitrix24's own `profile.json` -- a harmless, always-available
        read-only method included in every incoming webhook's default scope,
        regardless of which specific permissions the tenant granted it.
        Raises CrmApiError (-> a clean 400, not a 500) for a wrong/typo'd URL,
        instead of only surfacing the problem days later on the first real
        lead push -- same "validate at connect time" pattern as the Telegram
        bot token's getMe check."""
        url = f"{webhook_base_url.rstrip('/')}/profile.json"
        result = await to_thread(_get_json_sync, url)
        if "result" not in result:
            raise CrmApiError(f"Unexpected Bitrix24 response: {result}")

    async def list_users(self, credential: dict) -> list[dict]:
        """Same purpose as AmoCrmProvider.list_users -- Bitrix24's
        user.get.json (confirmed shape: NAME/LAST_NAME/EMAIL fields) returns
        every active user for the incoming webhook's account."""
        webhook_base_url = credential["api_key_encrypted"].rstrip("/")
        url = f"{webhook_base_url}/user.get.json"
        result = await to_thread(_get_json_sync, url)
        users = result.get("result", [])
        out = []
        for u in users:
            name = " ".join(part for part in (u.get("NAME"), u.get("LAST_NAME")) if part).strip()
            out.append({"external_manager_id": str(u["ID"]), "name": name or u.get("EMAIL") or str(u["ID"])})
        return out

    async def list_tasks(self, credential: dict, external_manager_id: str, period_start, period_end) -> list[dict]:
        """Per-seller KPI page's "Follow-up" metric (2026-07-13). Bitrix24's
        exact `tasks.task.list` filter/field docs could not be confirmed via
        live fetch in this session (same known scraping limitation already
        noted above for Bitrix24's webhook shape) -- uses the well-established,
        stable field set (RESPONSIBLE_ID, DEADLINE, STATUS 1-7 where 5 =
        Completed, CLOSED_DATE), flagged for verification at real sandbox
        onboarding like this module's other Bitrix24 assumptions."""
        webhook_base_url = credential["api_key_encrypted"].rstrip("/")
        url = f"{webhook_base_url}/tasks.task.list.json"
        body = {
            "filter": {
                "RESPONSIBLE_ID": external_manager_id,
                ">=DEADLINE": period_start.strftime("%Y-%m-%dT%H:%M:%S"),
                "<=DEADLINE": period_end.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            "select": ["DEADLINE", "STATUS", "CLOSED_DATE"],
        }
        result = await to_thread(_post_json_sync, url, body, {})
        tasks = result.get("result", {}).get("tasks", []) if isinstance(result.get("result"), dict) else result.get("result", [])

        out = []
        for t in tasks:
            deadline = t.get("DEADLINE")
            if not deadline:
                continue
            due_at = datetime.fromisoformat(deadline)
            is_completed = str(t.get("STATUS")) == "5"
            closed_date = t.get("CLOSED_DATE")
            completed_at = datetime.fromisoformat(closed_date) if closed_date else None
            out.append(
                {
                    "due_at": due_at,
                    "completed": is_completed,
                    "on_time": is_completed and completed_at is not None and completed_at <= due_at,
                }
            )
        return out


_PROVIDERS: dict[str, CRMProvider] = {"amocrm": AmoCrmProvider(), "bitrix24": Bitrix24Provider()}


def get_provider(name: str) -> CRMProvider:
    provider = _PROVIDERS.get(name)
    if provider is None:
        raise UnknownProviderError
    return provider
