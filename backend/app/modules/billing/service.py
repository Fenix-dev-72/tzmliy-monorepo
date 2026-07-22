import asyncio
import base64
from datetime import datetime, timedelta, timezone
from uuid import UUID

import asyncpg

from app.core import notify, storage
from app.core.config import Settings
from app.core.database import platform_connection, tenant_connection
from app.modules.billing import providers, repository
from app.modules.billing.providers import ClickProvider, PaymeProvider
from app.modules.tenants import repository as tenants_repository

payme_provider = PaymeProvider()
click_provider = ClickProvider()


class PlanNotFoundError(Exception):
    pass


class SubscriptionNotFoundError(Exception):
    pass


class UsageNotComputedYetError(Exception):
    pass


class InvoiceNotFoundError(Exception):
    pass


class InvoiceNotPendingError(Exception):
    pass


class IdempotencyKeyReusedError(Exception):
    pass


class TwoFactorRequiredError(Exception):
    """Platform Admin without 2FA enabled attempted an action that touches
    tenant data -- same rule as tenants/service.py's create_tenant_admin_user."""

    pass


class PaymeRpcError(Exception):
    """Payme protocol-level failure. Always answered with HTTP 200 and a
    JSON-RPC error envelope, never an HTTPException."""

    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class ClickError(Exception):
    """Click protocol-level failure. Always answered with HTTP 200 and
    Click's own error envelope, never an HTTPException. Carries the raw
    request params so the router can echo click_trans_id/merchant_trans_id
    back even when the failure happens before those are fully validated."""

    def __init__(self, code: int, message: str, params: dict):
        self.code = code
        self.message = message
        self.params = params
        super().__init__(message)


def _to_epoch_ms(dt: datetime | None) -> int:
    return int(dt.timestamp() * 1000) if dt is not None else 0


async def _require_admin_2fa(pool: asyncpg.Pool, admin_id: UUID) -> None:
    async with platform_connection(pool) as conn:
        admin = await tenants_repository.get_platform_admin_by_id(conn, admin_id)
    if admin is None or not admin["totp_enabled"]:
        raise TwoFactorRequiredError


async def _audit(pool: asyncpg.Pool, admin_id: UUID, tenant_id: UUID, action: str, reason: str) -> None:
    async with platform_connection(pool) as conn:
        await tenants_repository.insert_audit_log(
            conn, actor_type="platform_admin", actor_id=admin_id, tenant_id=tenant_id, action=action, reason=reason
        )


async def _apply_successful_payment(conn: asyncpg.Connection, tenant_id: UUID, payment: dict) -> None:
    """Runs on the same connection/transaction as the payment-status flip
    (tenants has no RLS policy at all, so a plain UPDATE succeeds on any
    connection regardless of which helper opened it) -- keeps the status
    transition atomic with the payment write, no cross-module two-transaction
    gap needed here (unlike finance's tariff-change, which has real
    optimistic-concurrency logic that forces a second transaction)."""
    await repository.extend_tenant_subscription_period(conn, tenant_id, payment["period_start"], payment["period_end"])
    tenant = await tenants_repository.get_tenant_by_id(conn, tenant_id)
    if tenant is not None and tenant["status"] != "cancelled":
        await tenants_repository.update_tenant_status(conn, tenant_id, "active")


# --- Plans ------------------------------------------------------------------


async def list_billing_plans(pool: asyncpg.Pool) -> list[dict]:
    async with platform_connection(pool) as conn:
        return await repository.list_billing_plans(conn)


async def update_billing_plan(
    pool: asyncpg.Pool,
    code: str,
    price_amount: int | None,
    currency: str | None,
    max_users: int | None,
    max_billable_storage_bytes: int | None,
    is_active: bool | None,
) -> dict:
    async with platform_connection(pool) as conn:
        updated = await repository.update_billing_plan(
            conn, code, price_amount, currency, max_users, max_billable_storage_bytes, is_active
        )
    if updated is None:
        raise PlanNotFoundError
    return updated


# --- Subscription -------------------------------------------------------


async def get_subscription(pool: asyncpg.Pool, tenant_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sub = await repository.get_tenant_subscription(conn, tenant_id)
    if sub is None:
        raise SubscriptionNotFoundError
    return sub


async def get_subscription_as_admin(pool: asyncpg.Pool, admin_id: UUID, tenant_id: UUID, reason: str) -> dict:
    await _require_admin_2fa(pool, admin_id)
    async with tenant_connection(pool, tenant_id) as conn:
        sub = await repository.get_tenant_subscription(conn, tenant_id)
    if sub is None:
        raise SubscriptionNotFoundError
    await _audit(pool, admin_id, tenant_id, "view_subscription", reason)
    return sub


async def assign_subscription(
    pool: asyncpg.Pool,
    admin_id: UUID,
    tenant_id: UUID,
    billing_plan_code: str,
    current_period_start: datetime | None,
    reason: str,
) -> dict:
    await _require_admin_2fa(pool, admin_id)
    async with platform_connection(pool) as conn:
        plan = await repository.get_billing_plan_by_code(conn, billing_plan_code)
    if plan is None:
        raise PlanNotFoundError
    period_start = current_period_start or datetime.now(timezone.utc)
    period_end = period_start + timedelta(days=30 * plan["billing_period_months"])
    async with tenant_connection(pool, tenant_id) as conn:
        sub = await repository.upsert_tenant_subscription(conn, tenant_id, plan["id"], period_start, period_end)
    await _audit(pool, admin_id, tenant_id, "assign_subscription", reason)
    return sub


async def select_own_subscription(pool: asyncpg.Pool, tenant_id: UUID, billing_plan_code: str) -> dict:
    """Tenant-self-service equivalent of assign_subscription, for the "pay
    now instead of the trial" step right after self-registration -- no
    Platform Admin, 2FA, or reason involved (the tenant is acting on its own
    data, not another tenant's). Deliberately NOT privileged/2FA-gated
    (`billing.view`, not `billing.manage`) since a just-registered admin has
    no 2FA set up yet by design (opt-in, done later) -- gating this the same
    way as `payments/initiate` would make "pay immediately during signup"
    impossible. Picking a plan doesn't move money by itself; the actual
    payment still goes through the already-2FA-gated `initiate_payment`."""
    async with platform_connection(pool) as conn:
        plan = await repository.get_billing_plan_by_code(conn, billing_plan_code)
    if plan is None:
        raise PlanNotFoundError
    period_start = datetime.now(timezone.utc)
    period_end = period_start + timedelta(days=30 * plan["billing_period_months"])
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_tenant_subscription(conn, tenant_id, plan["id"], period_start, period_end)


# --- Payments / invoices --------------------------------------------------


def _build_checkout_url(provider: str, settings: Settings, tenant_id: UUID, payment_id: UUID, amount_som: int) -> str:
    """Illustrative checkout-link construction -- the point of this phase is
    the webhook/RPC handling, not the storefront redirect flow. Payme's
    account fields and Click's merchant_trans_id are exactly what the
    respective webhook/RPC handlers below expect back."""
    if provider == "payme":
        account = (
            f"m={settings.payme_merchant_id};"
            f"ac.subscription_payment_id={payment_id};ac.tenant_id={tenant_id};"
            f"a={payme_provider.to_tiyin(amount_som)}"
        )
        encoded = base64.b64encode(account.encode()).decode()
        return f"https://checkout.paycom.uz/{encoded}"
    if provider == "click":
        merchant_trans_id = f"{tenant_id}:{payment_id}"
        return (
            "https://my.click.uz/services/pay"
            f"?service_id={settings.click_service_id}&merchant_id={settings.click_merchant_id}"
            f"&amount={amount_som}&transaction_param={merchant_trans_id}"
        )
    raise ValueError(f"Unknown provider: {provider}")


async def initiate_payment(
    pool: asyncpg.Pool, settings: Settings, tenant_id: UUID, user_id: UUID, provider: str, idempotency_key: str
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sub = await repository.get_tenant_subscription(conn, tenant_id)
        if sub is None:
            raise SubscriptionNotFoundError
        plan = await repository.get_billing_plan_by_id(conn, sub["billing_plan_id"])
        period_start = sub["current_period_end"]
        period_end = period_start + timedelta(days=30 * plan["billing_period_months"])
        row = await repository.insert_subscription_payment(
            conn,
            tenant_id,
            sub["id"],
            plan["id"],
            provider,
            plan["price_amount"],
            plan["currency"],
            period_start,
            period_end,
            idempotency_key,
            user_id,
            None,
        )
        if row is None:
            existing = await repository.get_subscription_payment_by_idempotency_key(conn, idempotency_key)
            if existing is not None and existing["tenant_id"] == tenant_id and existing["provider"] == provider:
                row = existing
            else:
                raise IdempotencyKeyReusedError
    checkout_url = _build_checkout_url(provider, settings, tenant_id, row["id"], row["amount"])
    return {"payment_id": row["id"], "provider": provider, "checkout_url": checkout_url}


async def list_payments(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_subscription_payments(conn)


async def list_invoices_as_admin(pool: asyncpg.Pool, admin_id: UUID, tenant_id: UUID, reason: str) -> list[dict]:
    await _require_admin_2fa(pool, admin_id)
    async with tenant_connection(pool, tenant_id) as conn:
        invoices = await repository.list_subscription_payments(conn)
    await _audit(pool, admin_id, tenant_id, "list_invoices", reason)
    return invoices


async def create_manual_invoice(
    pool: asyncpg.Pool,
    admin_id: UUID,
    tenant_id: UUID,
    amount: int,
    currency: str,
    period_start: datetime | None,
    period_end: datetime | None,
    reason: str,
    idempotency_key: str,
) -> dict:
    await _require_admin_2fa(pool, admin_id)
    async with tenant_connection(pool, tenant_id) as conn:
        sub = await repository.get_tenant_subscription(conn, tenant_id)
        if sub is None:
            raise SubscriptionNotFoundError
        p_start = period_start or sub["current_period_start"]
        p_end = period_end or sub["current_period_end"]
        row = await repository.insert_subscription_payment(
            conn,
            tenant_id,
            sub["id"],
            sub["billing_plan_id"],
            "manual",
            amount,
            currency,
            p_start,
            p_end,
            idempotency_key,
            None,
            admin_id,
        )
        if row is None:
            existing = await repository.get_subscription_payment_by_idempotency_key(conn, idempotency_key)
            if (
                existing is not None
                and existing["tenant_id"] == tenant_id
                and existing["amount"] == amount
                and existing["currency"] == currency
            ):
                row = existing
            else:
                raise IdempotencyKeyReusedError
    await _audit(pool, admin_id, tenant_id, "create_manual_invoice", reason)
    return row


async def mark_invoice_paid(
    pool: asyncpg.Pool, admin_id: UUID, tenant_id: UUID, payment_id: UUID, reason: str, idempotency_key: str
) -> dict:
    await _require_admin_2fa(pool, admin_id)
    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_id(conn, payment_id)
        if payment is None or payment["tenant_id"] != tenant_id:
            raise InvoiceNotFoundError
        if payment["status"] != "pending":
            if payment["status"] == "paid" and payment["review_idempotency_key"] == idempotency_key:
                return payment
            raise InvoiceNotPendingError
        updated = await repository.mark_subscription_payment_paid(conn, payment_id, None, idempotency_key)
        if updated is None:
            raise InvoiceNotPendingError
        await _apply_successful_payment(conn, tenant_id, updated)
    await _audit(pool, admin_id, tenant_id, "mark_invoice_paid", reason)
    return updated


# --- Storage usage --------------------------------------------------------


async def get_usage(pool: asyncpg.Pool, tenant_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        snapshot = await repository.get_latest_storage_usage_snapshot(conn)
    if snapshot is None:
        raise UsageNotComputedYetError
    return snapshot


async def recalculate_storage(
    pool: asyncpg.Pool, admin_id: UUID, tenant_id: UUID, reason: str, settings: Settings, force: bool = False
) -> dict:
    """optimize.md #9: compute_tenant_db_bytes scans every tenant-scoped table
    (pg_column_size over ~24 tables) -- skip redoing that if the latest
    snapshot is still fresh (billing_storage_recalc_cache_minutes), unless the
    caller explicitly asks for force=True. Storage doesn't change fast enough
    to need a fresh scan on every manual click."""
    await _require_admin_2fa(pool, admin_id)
    cached_snapshot: dict | None = None
    async with tenant_connection(pool, tenant_id) as conn:
        if not force:
            latest = await repository.get_latest_storage_usage_snapshot(conn)
            if latest is not None:
                age = datetime.now(timezone.utc) - latest["computed_at"]
                if age < timedelta(minutes=settings.billing_storage_recalc_cache_minutes):
                    cached_snapshot = latest

        if cached_snapshot is None:
            sub = await repository.get_tenant_subscription(conn, tenant_id)
            if sub is None:
                raise SubscriptionNotFoundError
            plan = await repository.get_billing_plan_by_id(conn, sub["billing_plan_id"])

            db_bytes = await repository.compute_tenant_db_bytes(conn)
            object_bytes = await storage.get_prefix_total_bytes(f"recordings/{tenant_id}/")
            total_bytes = db_bytes + object_bytes
            limit = plan["max_billable_storage_bytes"]
            usage_ratio_bps = (total_bytes * 10000) // limit

            snapshot = await repository.upsert_storage_usage_snapshot(
                conn, tenant_id, db_bytes, object_bytes, total_bytes, limit, usage_ratio_bps
            )

            warning_80 = sub["warning_80_sent_at"]
            warning_100 = sub["warning_100_sent_at"]
            new_warning_80, new_warning_100 = warning_80, warning_100
            now = datetime.now(timezone.utc)

            if usage_ratio_bps >= 10000:
                if warning_100 is None:
                    notify.send_alert(
                        channel="system",
                        destination=str(tenant_id),
                        message=f"Storage usage at {usage_ratio_bps / 100:.0f}% of plan limit",
                    )
                    new_warning_100 = now
            else:
                new_warning_100 = None

            if usage_ratio_bps >= 8000:
                if warning_80 is None:
                    notify.send_alert(
                        channel="system",
                        destination=str(tenant_id),
                        message=f"Storage usage at {usage_ratio_bps / 100:.0f}% of plan limit",
                    )
                    new_warning_80 = now
            else:
                new_warning_80 = None

            if new_warning_80 != warning_80 or new_warning_100 != warning_100:
                await repository.set_storage_warning_flags(conn, tenant_id, new_warning_80, new_warning_100)

    result = cached_snapshot if cached_snapshot is not None else snapshot
    action = "recalculate_storage_cached" if cached_snapshot is not None else "recalculate_storage"
    await _audit(pool, admin_id, tenant_id, action, reason)
    return result


# --- Dunning ----------------------------------------------------------------


async def run_dunning(pool: asyncpg.Pool, admin_id: UUID, settings: Settings, reason: str) -> list[dict]:
    await _require_admin_2fa(pool, admin_id)
    async with platform_connection(pool) as conn:
        all_tenants = await tenants_repository.list_tenants(conn)

    now = datetime.now(timezone.utc)
    # optimize.md #24 (2026-07-18): was a sequential `for tenant in
    # all_tenants` loop -- one slow tenant connection delayed every other
    # tenant's status advance on this run. Each tenant gets its own
    # tenant_connection, so running them concurrently is safe; bounded by a
    # semaphore, same shape as crm/worker.py's sync_meta_ads.
    semaphore = asyncio.Semaphore(settings.tenant_loop_max_concurrency)

    async def _advance_tenant(tenant: dict) -> dict | None:
        async with semaphore:
            old_status = tenant["status"]

            if old_status == "trial":
                # Self-registered (or Platform-Admin-provisioned) tenants that
                # never paid: trial_ends_at is set at tenant creation (DB column
                # default, 0020_self_registration.sql). NULL means "no automatic
                # expiry" -- an escape hatch for tenants that predate this
                # feature or were deliberately exempted, never auto-suspended.
                if tenant["trial_ends_at"] is not None and tenant["trial_ends_at"] < now:
                    async with tenant_connection(pool, tenant["id"]) as conn:
                        await tenants_repository.update_tenant_status(conn, tenant["id"], "suspended")
                    await _audit(pool, admin_id, tenant["id"], "dunning_advance:trial->suspended", reason)
                    return {"tenant_id": tenant["id"], "old_status": "trial", "new_status": "suspended"}
                return None

            if old_status not in ("active", "past_due", "grace"):
                return None

            async with tenant_connection(pool, tenant["id"]) as conn:
                sub = await repository.get_tenant_subscription(conn, tenant["id"])
                if sub is None or sub["current_period_end"] >= now:
                    return None

                overdue_for = now - sub["current_period_end"]
                new_status = old_status
                if old_status == "active":
                    new_status = "past_due"
                elif old_status == "past_due" and overdue_for >= timedelta(days=settings.billing_past_due_grace_days):
                    new_status = "grace"
                elif old_status == "grace" and overdue_for >= timedelta(
                    days=settings.billing_past_due_grace_days + settings.billing_grace_suspend_days
                ):
                    new_status = "suspended"

                if new_status == old_status:
                    return None
                await tenants_repository.update_tenant_status(conn, tenant["id"], new_status)

            await _audit(pool, admin_id, tenant["id"], f"dunning_advance:{old_status}->{new_status}", reason)
            return {"tenant_id": tenant["id"], "old_status": old_status, "new_status": new_status}

    advanced = await asyncio.gather(*(_advance_tenant(tenant) for tenant in all_tenants))
    return [result for result in advanced if result is not None]


# --- Payme JSON-RPC ---------------------------------------------------------


async def _resolve_tenant_for_payme_txn(pool: asyncpg.Pool, payme_txn_id: str) -> UUID:
    async with platform_connection(pool) as conn:
        ref = await repository.get_subscription_payment_provider_ref(conn, "payme", payme_txn_id)
    if ref is None:
        raise PaymeRpcError(providers.PAYME_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found")
    return ref["tenant_id"]


async def _payme_check_perform_transaction(pool: asyncpg.Pool, params: dict) -> dict:
    account = params["account"]
    try:
        payment_id = UUID(account["subscription_payment_id"])
        tenant_id = UUID(account["tenant_id"])
    except (KeyError, ValueError, TypeError) as exc:
        raise PaymeRpcError(providers.PAYME_ERROR_ACCOUNT_NOT_FOUND, "Order not found") from exc

    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_id(conn, payment_id)
    if payment is None or payment["tenant_id"] != tenant_id or payment["provider"] != "payme":
        raise PaymeRpcError(providers.PAYME_ERROR_ACCOUNT_NOT_FOUND, "Order not found")
    if payment["status"] != "pending":
        raise PaymeRpcError(providers.PAYME_ERROR_ALREADY_PAID, "Order already paid")
    if payme_provider.from_tiyin(int(params["amount"])) != payment["amount"]:
        raise PaymeRpcError(providers.PAYME_ERROR_INVALID_AMOUNT, "Incorrect amount")
    return {"allow": True}


async def _payme_create_transaction(pool: asyncpg.Pool, params: dict) -> dict:
    payme_txn_id = str(params["id"])
    amount = int(params["amount"])
    account = params["account"]

    async with platform_connection(pool) as conn:
        ref = await repository.get_subscription_payment_provider_ref(conn, "payme", payme_txn_id)
    if ref is not None:
        async with tenant_connection(pool, ref["tenant_id"]) as conn:
            payment = await repository.get_subscription_payment_by_id(conn, ref["subscription_payment_id"])
        if payment is None:
            raise PaymeRpcError(providers.PAYME_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found")
        return {
            "create_time": _to_epoch_ms(payment["created_at"]),
            "transaction": str(payment["id"]),
            "state": payment["provider_state"] or providers.PAYME_STATE_CREATED,
        }

    try:
        payment_id = UUID(account["subscription_payment_id"])
        tenant_id = UUID(account["tenant_id"])
    except (KeyError, ValueError, TypeError) as exc:
        raise PaymeRpcError(providers.PAYME_ERROR_ACCOUNT_NOT_FOUND, "Order not found") from exc

    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_id(conn, payment_id)
        if payment is None or payment["provider"] != "payme":
            raise PaymeRpcError(providers.PAYME_ERROR_ACCOUNT_NOT_FOUND, "Order not found")
        if payment["status"] != "pending":
            raise PaymeRpcError(providers.PAYME_ERROR_WRONG_STATE, "Order is not payable")
        if payme_provider.from_tiyin(amount) != payment["amount"]:
            raise PaymeRpcError(providers.PAYME_ERROR_INVALID_AMOUNT, "Incorrect amount")
        updated = await repository.set_subscription_payment_provider_transaction(
            conn, payment_id, payme_txn_id, providers.PAYME_STATE_CREATED
        )
        if updated is None:
            raise PaymeRpcError(providers.PAYME_ERROR_WRONG_STATE, "Transaction already created")

    async with platform_connection(pool) as conn:
        await repository.insert_subscription_payment_provider_ref(conn, "payme", payme_txn_id, tenant_id, payment_id)

    return {
        "create_time": _to_epoch_ms(updated["created_at"]),
        "transaction": str(payment_id),
        "state": providers.PAYME_STATE_CREATED,
    }


async def _payme_perform_transaction(pool: asyncpg.Pool, params: dict) -> dict:
    payme_txn_id = str(params["id"])
    tenant_id = await _resolve_tenant_for_payme_txn(pool, payme_txn_id)

    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_provider_txn(conn, "payme", payme_txn_id)
        if payment is None:
            raise PaymeRpcError(providers.PAYME_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found")
        if payment["status"] == "paid":
            return {
                "transaction": str(payment["id"]),
                "perform_time": _to_epoch_ms(payment["performed_at"]),
                "state": providers.PAYME_STATE_PERFORMED,
            }
        if payment["status"] != "pending":
            raise PaymeRpcError(providers.PAYME_ERROR_WRONG_STATE, "Transaction is not payable")
        updated = await repository.mark_subscription_payment_paid(conn, payment["id"], providers.PAYME_STATE_PERFORMED, None)
        if updated is None:
            raise PaymeRpcError(providers.PAYME_ERROR_WRONG_STATE, "Transaction is not payable")
        await _apply_successful_payment(conn, tenant_id, updated)

    return {
        "transaction": str(updated["id"]),
        "perform_time": _to_epoch_ms(updated["performed_at"]),
        "state": providers.PAYME_STATE_PERFORMED,
    }


async def _payme_cancel_transaction(pool: asyncpg.Pool, params: dict) -> dict:
    payme_txn_id = str(params["id"])
    reason_code = int(params["reason"])
    tenant_id = await _resolve_tenant_for_payme_txn(pool, payme_txn_id)

    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_provider_txn(conn, "payme", payme_txn_id)
        if payment is None:
            raise PaymeRpcError(providers.PAYME_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found")
        if payment["status"] == "cancelled":
            return {
                "transaction": str(payment["id"]),
                "cancel_time": _to_epoch_ms(payment["cancelled_at"]),
                "state": payment["provider_state"],
            }
        new_state = (
            providers.PAYME_STATE_CANCELLED_AFTER_PERFORM
            if payment["status"] == "paid"
            else providers.PAYME_STATE_CANCELLED
        )
        updated = await repository.mark_subscription_payment_cancelled(conn, payment["id"], new_state, reason_code, None)
        if updated is None:
            raise PaymeRpcError(providers.PAYME_ERROR_CANNOT_CANCEL, "Cannot cancel")

    return {
        "transaction": str(updated["id"]),
        "cancel_time": _to_epoch_ms(updated["cancelled_at"]),
        "state": new_state,
    }


async def _payme_check_transaction(pool: asyncpg.Pool, params: dict) -> dict:
    payme_txn_id = str(params["id"])
    tenant_id = await _resolve_tenant_for_payme_txn(pool, payme_txn_id)

    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_provider_txn(conn, "payme", payme_txn_id)
    if payment is None:
        raise PaymeRpcError(providers.PAYME_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found")

    return {
        "create_time": _to_epoch_ms(payment["created_at"]),
        "perform_time": _to_epoch_ms(payment["performed_at"]),
        "cancel_time": _to_epoch_ms(payment["cancelled_at"]),
        "transaction": str(payment["id"]),
        "state": payment["provider_state"] or providers.PAYME_STATE_CREATED,
        "reason": payment["cancel_reason"],
    }


_PAYME_METHODS = {
    "CheckPerformTransaction": _payme_check_perform_transaction,
    "CreateTransaction": _payme_create_transaction,
    "PerformTransaction": _payme_perform_transaction,
    "CancelTransaction": _payme_cancel_transaction,
    "CheckTransaction": _payme_check_transaction,
}


async def handle_payme_rpc(pool: asyncpg.Pool, method: str, params: dict) -> dict:
    handler = _PAYME_METHODS.get(method)
    if handler is None:
        raise PaymeRpcError(providers.PAYME_ERROR_METHOD_NOT_FOUND, "Method not found")
    return await handler(pool, params)


# --- Click Shop API ----------------------------------------------------------


async def handle_click_webhook(pool: asyncpg.Pool, settings: Settings, params: dict) -> dict:
    if not click_provider.verify_signature(params, settings.click_secret_key):
        raise ClickError(providers.CLICK_ERROR_SIGN_FAILED, "SIGN CHECK FAILED", params)

    action = int(params["action"])
    merchant_trans_id = str(params["merchant_trans_id"])
    try:
        tenant_str, payment_str = merchant_trans_id.split(":", 1)
        tenant_id, payment_id = UUID(tenant_str), UUID(payment_str)
    except (ValueError, AttributeError) as exc:
        raise ClickError(providers.CLICK_ERROR_ORDER_NOT_FOUND, "Order not found", params) from exc

    try:
        amount_som = round(float(params["amount"]))
    except (TypeError, ValueError) as exc:
        raise ClickError(providers.CLICK_ERROR_INVALID_AMOUNT, "Incorrect amount", params) from exc

    click_trans_id = str(params["click_trans_id"])

    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_subscription_payment_by_id(conn, payment_id)
        if payment is None or payment["tenant_id"] != tenant_id or payment["provider"] != "click":
            raise ClickError(providers.CLICK_ERROR_ORDER_NOT_FOUND, "Order not found", params)
        if amount_som != payment["amount"]:
            raise ClickError(providers.CLICK_ERROR_INVALID_AMOUNT, "Incorrect amount", params)

        if action == providers.CLICK_ACTION_PREPARE:
            if payment["status"] != "pending":
                raise ClickError(providers.CLICK_ERROR_ALREADY_PAID, "Already paid", params)
            await repository.set_subscription_payment_provider_transaction(conn, payment_id, click_trans_id, None)
            return {
                "click_trans_id": params["click_trans_id"],
                "merchant_trans_id": merchant_trans_id,
                "merchant_prepare_id": str(payment_id),
                "error": providers.CLICK_ERROR_SUCCESS,
                "error_note": "Success",
            }

        # action == CLICK_ACTION_COMPLETE
        merchant_prepare_id = str(params.get("merchant_prepare_id", ""))
        if merchant_prepare_id != str(payment_id):
            raise ClickError(providers.CLICK_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found", params)

        click_reported_error = int(params.get("error", 0))
        if click_reported_error < 0:
            await repository.mark_subscription_payment_cancelled(conn, payment_id, None, click_reported_error, None)
            return {
                "click_trans_id": params["click_trans_id"],
                "merchant_trans_id": merchant_trans_id,
                "merchant_confirm_id": str(payment_id),
                "error": providers.CLICK_ERROR_SUCCESS,
                "error_note": "Cancelled",
            }

        if payment["status"] == "paid":
            # Idempotent replay of a Complete notification we already applied.
            return {
                "click_trans_id": params["click_trans_id"],
                "merchant_trans_id": merchant_trans_id,
                "merchant_confirm_id": str(payment_id),
                "error": providers.CLICK_ERROR_SUCCESS,
                "error_note": "Success",
            }

        updated = await repository.mark_subscription_payment_paid(conn, payment_id, None, None)
        if updated is None:
            raise ClickError(providers.CLICK_ERROR_TRANSACTION_NOT_FOUND, "Transaction not found", params)
        await _apply_successful_payment(conn, tenant_id, updated)

    return {
        "click_trans_id": params["click_trans_id"],
        "merchant_trans_id": merchant_trans_id,
        "merchant_confirm_id": str(payment_id),
        "error": providers.CLICK_ERROR_SUCCESS,
        "error_note": "Success",
    }
