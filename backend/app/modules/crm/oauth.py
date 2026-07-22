"""One-click OAuth connect for AmoCRM, Bitrix24, Meta Ads (2026-07-15).

Mirrors providers.py's sync-then-to_thread shape and reuses its
_get_json_sync/_post_json_sync/CrmApiError rather than duplicating HTTP error
handling. This module only builds authorize URLs and exchanges/refreshes
tokens -- crm/service.py owns state (CSRF) storage and persisting the result
into integration_credentials.

Caveat (same "verify before production" convention as providers.py's own
docstring, since no real OAuth app is registered with any of these three
providers yet to confirm live): the three providers' token endpoints are NOT
uniform --
  - AmoCRM: POST, JSON body (its whole API is JSON-based).
  - Bitrix24 and Meta Ads: GET with the params in the query string (both
    documented this way; Bitrix24 also supports an app-install push flow --
    ONAPPINSTALL posting AUTH_ID/REFRESH_ID directly -- as an alternative to
    this standard redirect flow; re-verify which one a real Bitrix24 app
    registration actually expects).
AmoCRM and Bitrix24 are both portal-specific (the OAuth authorize/token host
is that tenant's own subdomain), so both need a tenant-supplied `domain`;
Meta Ads' endpoints are fixed and need no domain.
"""

import urllib.parse
from asyncio import to_thread
from typing import Literal

from app.modules.crm.providers import CrmApiError, _get_json_sync, _post_json_sync

OAuthProvider = Literal["amocrm", "bitrix24", "meta_ads"]

_META_ADS_API_VERSION = "v19.0"


class UnknownOAuthProviderError(Exception):
    pass


def _require_domain(provider: str, domain: str | None) -> str:
    if not domain:
        raise ValueError(f"{provider} OAuth requires a portal/account subdomain")
    return domain


def build_authorize_url(provider: OAuthProvider, client_id: str, redirect_uri: str, state: str, domain: str | None = None) -> str:
    if provider == "amocrm":
        # Confirmed against amoCRM's real docs (2026-07-15, live test against a
        # real registered integration): the authorize step is NOT
        # subdomain-specific -- https://www.amocrm.ru/oauth is the one
        # centralized host regardless of which account approves it. Using
        # {domain}.amocrm.ru/oauth (the original guess) 404s/falls back to the
        # marketing homepage instead of the consent screen. mode=popup (not
        # post_message) is required for a plain top-level redirect -- post_message
        # expects the opener window to receive the result via window.postMessage,
        # which this app never listens for. redirect_uri is deliberately not a
        # param here -- amoCRM uses whatever was registered with the integration,
        # not a per-request value. The actual account's subdomain only becomes
        # known from the callback's own `referer` param (see router.py).
        params = {"client_id": client_id, "state": state, "mode": "popup"}
        return f"https://www.amocrm.ru/oauth?{urllib.parse.urlencode(params)}"
    if provider == "bitrix24":
        domain = _require_domain(provider, domain)
        params = {"client_id": client_id, "state": state}
        return f"https://{domain}.bitrix24.ru/oauth/authorize/?{urllib.parse.urlencode(params)}"
    if provider == "meta_ads":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": "ads_read,ads_management",
        }
        return f"https://www.facebook.com/{_META_ADS_API_VERSION}/dialog/oauth?{urllib.parse.urlencode(params)}"
    raise UnknownOAuthProviderError(provider)


async def exchange_code(
    provider: OAuthProvider, client_id: str, client_secret: str, code: str, redirect_uri: str, domain: str | None = None
) -> dict:
    """Returns {access_token, refresh_token, expires_in, account_domain}."""
    if provider == "amocrm":
        domain = _require_domain(provider, domain)
        body = {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }
        data = await to_thread(_post_json_sync, f"https://{domain}.amocrm.ru/oauth2/access_token", body, {})
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
            "account_domain": domain,
        }
    if provider == "bitrix24":
        domain = _require_domain(provider, domain)
        params = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
        }
        url = f"https://oauth.bitrix.info/oauth/token/?{urllib.parse.urlencode(params)}"
        data = await to_thread(_get_json_sync, url)
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
            "account_domain": data.get("domain", domain),
        }
    if provider == "meta_ads":
        params = {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        }
        url = f"https://graph.facebook.com/{_META_ADS_API_VERSION}/oauth/access_token?{urllib.parse.urlencode(params)}"
        data = await to_thread(_get_json_sync, url)
        return {
            "access_token": data["access_token"],
            # Meta's short-lived/long-lived token dance has no refresh_token
            # concept -- long-lived tokens (~60 days) are exchanged for
            # separately, not refreshed. Flagged here rather than silently
            # assumed; revisit once a real app confirms the exact contract.
            "refresh_token": None,
            "expires_in": data.get("expires_in"),
            "account_domain": None,
        }
    raise UnknownOAuthProviderError(provider)


async def refresh_access_token(
    provider: OAuthProvider, client_id: str, client_secret: str, refresh_token: str, redirect_uri: str, domain: str | None = None
) -> dict:
    """Returns {access_token, refresh_token, expires_in} -- same shape as
    exchange_code minus account_domain (a refresh never changes which
    portal/account the credential belongs to; callers already have it from
    the stored external_account_id)."""
    if provider == "amocrm":
        domain = _require_domain(provider, domain)
        body = {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "redirect_uri": redirect_uri,
        }
        data = await to_thread(_post_json_sync, f"https://{domain}.amocrm.ru/oauth2/access_token", body, {})
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", refresh_token),
            "expires_in": data.get("expires_in"),
        }
    if provider == "bitrix24":
        params = {
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        }
        url = f"https://oauth.bitrix.info/oauth/token/?{urllib.parse.urlencode(params)}"
        data = await to_thread(_get_json_sync, url)
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", refresh_token),
            "expires_in": data.get("expires_in"),
        }
    if provider == "meta_ads":
        raise CrmApiError("meta_ads has no refresh_token grant -- long-lived tokens are re-exchanged, not refreshed")
    raise UnknownOAuthProviderError(provider)
