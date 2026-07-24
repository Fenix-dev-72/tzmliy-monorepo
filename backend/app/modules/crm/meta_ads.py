"""Meta Marketing API (Graph API) client -- pull-only, no webhook/lead concept
at all, so it doesn't implement CRMProvider. Confirmed via a live fetch of
developers.facebook.com: GET https://graph.facebook.com/v.../{resource-id}/insights,
resource-id being an ad account (act_...), campaign, ad set, or ad id.

Plain urllib.request + asyncio.to_thread, matching the project's established
"no async HTTP client dependency" convention (calls/providers.py's
download_recording, notifications/telegram.py).
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from asyncio import to_thread
from datetime import date

from app.core.net import UnsafeUrlError, validate_public_url

_API_BASE = "https://graph.facebook.com/v21.0"


class MetaAdsApiError(Exception):
    def __init__(self, message: str, code: int | None = None):
        self.message = message
        self.code = code
        super().__init__(message)


def _get_json_sync(url: str) -> dict:
    try:
        # SSRF guard: defense-in-depth. The host here is the fixed Graph API
        # host, but validating keeps every outbound urlopen in this codebase
        # uniformly guarded.
        validate_public_url(url)
        with urllib.request.urlopen(url, timeout=30) as resp:
            body = json.loads(resp.read())
    except UnsafeUrlError as exc:
        raise MetaAdsApiError(str(exc)) from exc
    except urllib.error.HTTPError as exc:
        body = json.loads(exc.read())
    except urllib.error.URLError as exc:
        raise MetaAdsApiError(str(exc.reason)) from exc
    if "error" in body:
        raise MetaAdsApiError(body["error"].get("message", "Unknown Meta API error"), body["error"].get("code"))
    return body


def _list_campaigns_sync(access_token: str, ad_account_id: str) -> list[dict]:
    query = urllib.parse.urlencode({"fields": "id,name,status", "access_token": access_token})
    body = _get_json_sync(f"{_API_BASE}/{ad_account_id}/campaigns?{query}")
    return body.get("data", [])


def _get_campaign_insights_sync(access_token: str, campaign_id: str, since_date: date, until_date: date) -> list[dict]:
    time_range = json.dumps({"since": since_date.isoformat(), "until": until_date.isoformat()})
    query = urllib.parse.urlencode(
        {
            "fields": "impressions,clicks,spend,date_start,date_stop",
            "time_range": time_range,
            "level": "campaign",
            "access_token": access_token,
        }
    )
    body = _get_json_sync(f"{_API_BASE}/{campaign_id}/insights?{query}")
    return body.get("data", [])


def _list_ad_accounts_sync(access_token: str) -> list[dict]:
    query = urllib.parse.urlencode({"fields": "id,account_id,name", "access_token": access_token})
    body = _get_json_sync(f"{_API_BASE}/me/adaccounts?{query}")
    return body.get("data", [])


async def list_ad_accounts(access_token: str) -> list[dict]:
    """Auto-discovery for the OAuth connect flow (2026-07-24) -- so a tenant
    no longer has to know/type their own act_{id}. Requires ads_read/
    ads_management scope (already requested in build_authorize_url). Returns
    [] for a real, valid token with zero ad accounts linked to the Facebook
    account -- that's a legitimate state (confirmed live against the user's
    own test token), not an error; callers must handle an empty list rather
    than assuming at least one always exists.
    """
    return await to_thread(_list_ad_accounts_sync, access_token)


async def list_campaigns(access_token: str, ad_account_id: str) -> list[dict]:
    return await to_thread(_list_campaigns_sync, access_token, ad_account_id)


async def get_campaign_insights(access_token: str, campaign_id: str, since_date: date, until_date: date) -> list[dict]:
    return await to_thread(_get_campaign_insights_sync, access_token, campaign_id, since_date, until_date)
