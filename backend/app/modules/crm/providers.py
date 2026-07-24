"""AmoCRM / Bitrix24 CRMProvider adapters -- mirrors calls/providers.py's
CallProvider shape (frozen-dataclass event + name-keyed registry +
get_provider()/UnknownProviderError), but necessarily broader since CRM sync
is bidirectional, unlike calls' pure webhook-inbound shape.

**Neither provider uses webhooks at all anymore (2026-07-24, client
decision)** -- both were originally webhook-based (AmoCRM: shared-secret
query param + form-urlencoded bracket notation; Bitrix24: an outgoing
webhook's `auth[application_token]`/`data[FIELDS]`), but webhook delivery is
never guaranteed (missed during downtime, and a lead created before the
integration was ever connected never fires one at all), so both now pull
leads periodically instead via each provider's own `list_leads` method (see
crm/worker.py's sync_amocrm_leads/sync_bitrix24_leads). Both providers are
now fully OAuth-based too -- no more manually-pasted AmoCRM api_token or
Bitrix24 incoming-webhook URL; `crm/oauth.py`'s existing OAuth flow (already
built for all three providers) is the only connect path, "1 tugma bilan
ulash." AmoCRM's list_leads (`GET /api/v4/leads?filter[updated_at][from]=`)
is confirmed against amocrm.ru/developers/content/crm_platform/leads-api;
Bitrix24's (`crm.lead.list`, filter key `">DATE_MODIFY"`) against
apidocs.bitrix24.ru -- both providers' outbound push (crm.lead.add-shaped)
is otherwise unchanged, just re-pointed at the OAuth access_token instead of
the old credential shape.
"""

import json
import urllib.error
import urllib.request
from asyncio import to_thread
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
    # Neither provider's lead-list response reliably carries a phone inline
    # (AmoCRM: never, confirmed 2026-07-15 -- contact info is a wholly
    # separate entity; Bitrix24: PHONE is present but this dataclass treats
    # it as optional either way now that both go through the same pull-based
    # ingest path) -- None means "backfill via a follow-up API call if the
    # provider supports one" (AmoCrmProvider.fetch_lead_phone) or "sync
    # without a phone" otherwise, never a hard failure.
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
    # omit it entirely). status_id is the provider's own pipeline status id
    # (AmoCRM: universal 142/143 for Won/Lost; Bitrix24: portal-specific, not
    # interpreted for won/lost -- see Bitrix24Provider.list_leads) --  kept as
    # a raw string here (provider-specific meaning), interpreted by
    # crm/service.py's ingestion, not this dataclass.
    price_amount: int | None = None
    status_id: str | None = None


class CRMProvider(Protocol):
    name: str

    async def list_leads(self, credential: dict, since: datetime) -> list[ParsedLeadEvent]: ...

    async def push_lead(self, credential: dict, customer: dict) -> str: ...


def _first_multi_value(field) -> str | None:
    """Bitrix24's own multi-value field shape (PHONE/EMAIL) is a list of
    {VALUE, VALUE_TYPE} dicts, not a bare string -- takes the first value,
    same "first value wins" simplification AmoCrmProvider.fetch_lead_phone
    already uses for its own contact lookup. Defensively also accepts a bare
    string, in case a future Bitrix24 response shape ever flattens it."""
    if isinstance(field, list) and field:
        return field[0].get("VALUE")
    if isinstance(field, str):
        return field or None
    return None


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

    async def list_leads(self, credential: dict, since: datetime) -> list[ParsedLeadEvent]:
        """Pull-based lead sync (2026-07-24, client decision -- replaces the
        webhook entirely): webhook delivery was never guaranteed (missed
        deliveries during downtime, and a lead created before this
        integration was ever connected would never fire one at all), so
        leads are pulled the same way list_calls above already pulls calls,
        via `filter[updated_at][from]`. Field names confirmed against
        amocrm.ru/developers/content/crm_platform/leads-api -- status_id 142
        (Won) and 143 (Lost) are reserved, identical across every AmoCRM
        account/pipeline, which is what makes crm/service.py's
        _AMOCRM_WON_STATUS_ID/_AMOCRM_LOST_STATUS_ID a safe cross-tenant
        constant. phone is always None here (a lead's own fields never carry
        contact info) -- crm/service.py's ingest_amocrm_lead backfills it via
        fetch_lead_phone below, same as the old webhook path did."""
        subdomain = credential["external_account_id"]
        headers = {"Authorization": f"Bearer {credential['api_key_encrypted']}"}
        since_ts = int(since.timestamp())

        leads: list[ParsedLeadEvent] = []
        page = 1
        while True:
            url = f"https://{subdomain}.amocrm.ru/api/v4/leads?filter[updated_at][from]={since_ts}&limit=250&page={page}"
            result = await to_thread(_get_json_sync, url, headers)
            page_leads = result.get("_embedded", {}).get("leads", [])
            if not page_leads:
                break
            for lead in page_leads:
                price_raw = lead.get("price")
                leads.append(
                    ParsedLeadEvent(
                        external_lead_id=str(lead["id"]),
                        full_name=lead.get("name") or "AmoCRM Lead",
                        phone=None,
                        email=None,
                        stage="lead",
                        responsible_manager_id=str(lead["responsible_user_id"]) if lead.get("responsible_user_id") else None,
                        price_amount=int(price_raw) if price_raw not in (None, "") else None,
                        status_id=str(lead["status_id"]) if lead.get("status_id") else None,
                    )
                )
            if len(page_leads) < 250:
                break
            page += 1
        return leads

    async def fetch_lead_phone(self, credential: dict, external_lead_id: str) -> str | None:
        """Backfills the phone a lead never carries inline (see list_leads'
        docstring above) -- fetches the lead's first linked contact, then
        that contact's first PHONE field value. Returns None (not an error)
        if the lead has no linked contact or the contact
        has no phone -- ingest_amocrm_lead treats that as "can't sync this
        one", same graceful-degradation shape as everywhere else in this
        module."""
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
        not use this AmoCRM feature) or the lookup fails; ingest_amocrm_lead
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


def _bitrix24_rest_url(domain: str, method: str) -> str:
    """Normalizes whatever complete_oauth stored as external_account_id (the
    OAuth token response's own "domain" field, confirmed by
    apidocs.bitrix24.ru's authorization docs to already be a full hostname
    like "mycompany.bitrix24.ru") into a real REST URL. The `if "." not in`
    fallback only guards a bare subdomain slipping through (e.g. if a future
    Bitrix24 response shape ever omits the suffix) -- defensive, not the
    expected case."""
    domain = domain.strip()
    if "." not in domain:
        domain = f"{domain}.bitrix24.ru"
    return f"https://{domain}/rest/{method}.json"


class Bitrix24Provider:
    name = "bitrix24"

    async def push_lead(self, credential: dict, customer: dict) -> str:
        # OAuth-only (2026-07-24, client decision -- see this module's
        # docstring): api_key_encrypted is now the OAuth access_token,
        # external_account_id the portal domain. Confirmed against
        # apidocs.bitrix24.ru: an OAuth REST call is a normal POST to
        # https://{domain}/rest/{method}.json with `auth` as a body field
        # (not a query param, not an Authorization header).
        url = _bitrix24_rest_url(credential["external_account_id"], "crm.lead.add")
        body = {
            "auth": credential["api_key_encrypted"],
            "fields": {
                "TITLE": customer["full_name"],
                "NAME": customer["full_name"],
                "PHONE": [{"VALUE": customer["phone"], "VALUE_TYPE": "WORK"}],
            },
        }
        result = await to_thread(_post_json_sync, url, body, {})
        if "result" not in result:
            raise CrmApiError(f"Unexpected Bitrix24 response: {result}")
        return str(result["result"])

    async def list_leads(self, credential: dict, since: datetime) -> list[ParsedLeadEvent]:
        """Pull-based lead sync (2026-07-24, same client decision/reasoning
        as AmoCRM's own list_leads -- see this module's docstring).
        `crm.lead.list` is documented DEPRECATED in favor of `crm.item.list`,
        but still fully functional and is what push_lead above already
        targets (crm.lead.add), so this stays in the same, already-proven API
        family rather than mixing old and new CRM APIs in one adapter.
        Confirmed against apidocs.bitrix24.ru: filter key syntax is the
        literal string ">DATE_MODIFY" (the comparison operator is part of
        the key, not bracket notation like AmoCRM's filter[updated_at][from]),
        pagination is start=(page-1)*50 with a fixed 50-row page size.
        PHONE/EMAIL come back in Bitrix24's own multi-value field shape (a
        list of {VALUE, VALUE_TYPE} dicts) -- takes the first value, same
        "first value wins" simplification AmoCRM's own phone-lookup already
        uses. No won/lost/price-sync handling here unlike AmoCRM's
        ingest_amocrm_lead -- Bitrix24's STATUS_ID values are portal-specific
        (custom pipeline stages), not a universal reserved code like
        AmoCRM's 142/143, so that mapping isn't safely automatable without a
        per-tenant "map your own stage" setting that doesn't exist yet
        (matches this integration's existing, narrower scope)."""
        since_iso = since.strftime("%Y-%m-%dT%H:%M:%S")
        leads: list[ParsedLeadEvent] = []
        start = 0
        while True:
            body = {
                "auth": credential["api_key_encrypted"],
                "filter": {">DATE_MODIFY": since_iso},
                "select": ["ID", "TITLE", "NAME", "PHONE", "EMAIL", "ASSIGNED_BY_ID", "STATUS_ID", "OPPORTUNITY"],
                "start": start,
            }
            url = _bitrix24_rest_url(credential["external_account_id"], "crm.lead.list")
            result = await to_thread(_post_json_sync, url, body, {})
            page_leads = result.get("result", [])
            if not isinstance(page_leads, list) or not page_leads:
                break
            for lead in page_leads:
                phone = _first_multi_value(lead.get("PHONE"))
                email = _first_multi_value(lead.get("EMAIL"))
                opportunity = lead.get("OPPORTUNITY")
                leads.append(
                    ParsedLeadEvent(
                        external_lead_id=str(lead["ID"]),
                        full_name=lead.get("TITLE") or lead.get("NAME") or "Bitrix24 Lead",
                        phone=phone,
                        email=email,
                        stage="lead",
                        responsible_manager_id=str(lead["ASSIGNED_BY_ID"]) if lead.get("ASSIGNED_BY_ID") else None,
                        price_amount=int(float(opportunity)) if opportunity not in (None, "") else None,
                        status_id=str(lead["STATUS_ID"]) if lead.get("STATUS_ID") else None,
                    )
                )
            if len(page_leads) < 50:
                break
            start += 50
        return leads

    async def list_users(self, credential: dict) -> list[dict]:
        """Same purpose as AmoCrmProvider.list_users -- Bitrix24's
        user.get (confirmed shape: NAME/LAST_NAME/EMAIL fields) returns
        every active user for the connected portal."""
        url = _bitrix24_rest_url(credential["external_account_id"], "user.get")
        result = await to_thread(_post_json_sync, url, {"auth": credential["api_key_encrypted"]}, {})
        users = result.get("result", [])
        out = []
        for u in users:
            name = " ".join(part for part in (u.get("NAME"), u.get("LAST_NAME")) if part).strip()
            out.append({"external_manager_id": str(u["ID"]), "name": name or u.get("EMAIL") or str(u["ID"])})
        return out

    async def list_tasks(self, credential: dict, external_manager_id: str, period_start, period_end) -> list[dict]:
        """Per-seller KPI page's "Follow-up" metric (2026-07-13). Bitrix24's
        exact `tasks.task.list` filter/field docs could not be confirmed via
        live fetch in this session -- uses the well-established, stable
        field set (RESPONSIBLE_ID, DEADLINE, STATUS 1-7 where 5 = Completed,
        CLOSED_DATE), flagged for verification at real sandbox onboarding
        like this module's other Bitrix24 assumptions."""
        url = _bitrix24_rest_url(credential["external_account_id"], "tasks.task.list")
        body = {
            "auth": credential["api_key_encrypted"],
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
