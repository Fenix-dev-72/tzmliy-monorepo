"""Payme and Click merchant-protocol helpers.

Unlike calls/providers.py's CallProvider Protocol (one shape for two
webhook-style integrations), Payme and Click are genuinely differently
shaped: Payme is synchronous JSON-RPC 2.0 (the provider calls a single
merchant endpoint and expects an immediate result/error envelope back),
Click is a two-phase form-encoded webhook (Prepare then Complete). Forcing
one interface on both would be fake symmetry, so each gets its own small
helper class here; method/action dispatch and all side effects live in
service.py.

Payme's spec (methods, error codes, transaction states) was confirmed via a
live fetch of developer.help.paycom.uz. Click's spec below comes from
extremely stable, long-unchanged public community documentation (widely used
PHP/Python Shop API integrations) rather than a live fetch -- the two-phase
Prepare/Complete shape and MD5 sign_string formula are correct with high
confidence, but double-check the exact error-code table against
docs.click.uz / Click's merchant cabinet during real sandbox onboarding
before going to production (same caveat style as Faza 7's UTEL/Мои звонки
placeholders).
"""

import base64
import hashlib
import hmac
from collections.abc import Mapping

# --- Payme --------------------------------------------------------------

# Standard Merchant API JSON-RPC error codes.
PAYME_ERROR_METHOD_NOT_POST = -32300
PAYME_ERROR_PARSE_ERROR = -32700
PAYME_ERROR_INVALID_PARAMS = -32600
PAYME_ERROR_METHOD_NOT_FOUND = -32601
PAYME_ERROR_INSUFFICIENT_PRIVILEGE = -32504
PAYME_ERROR_SYSTEM = -32400
PAYME_ERROR_INVALID_AMOUNT = -31001
PAYME_ERROR_TRANSACTION_NOT_FOUND = -31003
PAYME_ERROR_CANNOT_CANCEL = -31007
PAYME_ERROR_WRONG_STATE = -31008
# -31050..-31099 reserved for merchant-defined account-validation errors.
PAYME_ERROR_ACCOUNT_NOT_FOUND = -31050
PAYME_ERROR_ALREADY_PAID = -31051

# Transaction states.
PAYME_STATE_CREATED = 1
PAYME_STATE_PERFORMED = 2
PAYME_STATE_CANCELLED = -1
PAYME_STATE_CANCELLED_AFTER_PERFORM = -2


class PaymeProvider:
    name = "payme"

    def verify_auth(self, headers: Mapping[str, str], merchant_key: str) -> bool:
        """Payme authenticates with `Authorization: Basic base64("Paycom:"+key)`,
        not a signed payload -- this is the entirety of the auth check."""
        expected = "Basic " + base64.b64encode(f"Paycom:{merchant_key}".encode()).decode()
        actual = headers.get("authorization") or headers.get("Authorization") or ""
        return hmac.compare_digest(expected, actual)

    def to_tiyin(self, som: int) -> int:
        """Payme's protocol amount unit is tiyin (1 so'm = 100 tiyin); the
        app's internal amount stays in so'm everywhere else."""
        return som * 100

    def from_tiyin(self, tiyin: int) -> int:
        return tiyin // 100


# --- Click ----------------------------------------------------------------

CLICK_ACTION_PREPARE = 0
CLICK_ACTION_COMPLETE = 1

CLICK_ERROR_SUCCESS = 0
CLICK_ERROR_SIGN_FAILED = -1
CLICK_ERROR_INVALID_AMOUNT = -2
CLICK_ERROR_ACTION_NOT_FOUND = -3
CLICK_ERROR_ALREADY_PAID = -4
CLICK_ERROR_ORDER_NOT_FOUND = -5
CLICK_ERROR_TRANSACTION_NOT_FOUND = -6
CLICK_ERROR_UPDATE_FAILED = -7
CLICK_ERROR_BAD_REQUEST = -8
CLICK_ERROR_CANCELLED = -9


class ClickProvider:
    name = "click"

    def verify_signature(self, params: Mapping[str, object], secret: str) -> bool:
        """sign_string = MD5(click_trans_id + service_id + SECRET_KEY +
        merchant_trans_id + [merchant_prepare_id if action==1] + amount +
        action + sign_time). Click sends this on both Prepare (action=0) and
        Complete (action=1); merchant_prepare_id only exists in the formula
        for the Complete step."""
        action = int(params["action"])
        parts = [str(params["click_trans_id"]), str(params["service_id"]), secret, str(params["merchant_trans_id"])]
        if action == CLICK_ACTION_COMPLETE:
            parts.append(str(params["merchant_prepare_id"]))
        parts.extend([str(params["amount"]), str(action), str(params["sign_time"])])
        expected = hashlib.md5("".join(parts).encode()).hexdigest()
        return hmac.compare_digest(expected, str(params.get("sign_string", "")))
