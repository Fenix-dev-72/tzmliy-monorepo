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

_API_BASE = "https://graph.facebook.com/v21.0"


class MetaAdsApiError(Exception):
    def __init__(self, message: str, code: int | None = None):
        self.message = message
        self.code = code
        super().__init__(message)


def _get_json_sync(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            body = json.loads(resp.read())
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


async def list_campaigns(access_token: str, ad_account_id: str) -> list[dict]:
    return await to_thread(_list_campaigns_sync, access_token, ad_account_id)


async def get_campaign_insights(access_token: str, campaign_id: str, since_date: date, until_date: date) -> list[dict]:
    return await to_thread(_get_campaign_insights_sync, access_token, campaign_id, since_date, until_date)
