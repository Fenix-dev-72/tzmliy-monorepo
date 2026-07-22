from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.finance import repository
from app.modules.sales import service as sales_service


class SaleNotFoundError(Exception):
    pass


class IdempotencyKeyReusedError(Exception):
    pass


class SaleCancelledError(Exception):
    pass


class PaymentCurrencyMismatchError(Exception):
    pass


class PaymentExceedsBalanceError(Exception):
    pass


class PaymentNotFoundError(Exception):
    pass


class PaymentAlreadyReversedError(Exception):
    pass


class AdjustmentRequestNotFoundError(Exception):
    pass


class AdjustmentRequestConflictError(Exception):
    pass


class InvalidAdjustmentPayloadError(Exception):
    pass


class RefundExceedsCollectedAmountError(Exception):
    pass


class AdjustmentApplyConflictError(Exception):
    pass


class RoleNotFoundError(Exception):
    pass


class InvalidBonusPlanError(Exception):
    pass


class CategoryNotFoundError(Exception):
    pass


class InvalidPeriodError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class PayrollJobNotFoundError(Exception):
    pass


async def post_charge(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    sale_id: UUID,
    customer_id: UUID,
    amount: int,
    currency: str,
    actor_user_id: UUID,
) -> None:
    """Internal-only: called by sales.router right after a sale is created.
    Not exposed over HTTP — the caller is already authorized via sales.manage."""
    async with tenant_connection(pool, tenant_id) as conn:
        await repository.insert_ledger_entry(
            conn, tenant_id, sale_id, customer_id, "charge", amount, currency, None, None, None, actor_user_id
        )


def _is_positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_nonnegative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _validate_refund_payload(payload: dict) -> int:
    refund_amount = payload.get("refund_amount")
    if not _is_positive_int(refund_amount):
        raise InvalidAdjustmentPayloadError
    return refund_amount


def _validate_tariff_change_payload(payload: dict) -> None:
    new_price_amount = payload.get("new_price_amount")
    new_deadline = payload.get("new_deadline")
    if new_price_amount is None and new_deadline is None:
        raise InvalidAdjustmentPayloadError
    if new_price_amount is not None and not _is_nonnegative_int(new_price_amount):
        raise InvalidAdjustmentPayloadError
    if new_deadline is not None:
        try:
            datetime.fromisoformat(new_deadline)
        except (TypeError, ValueError) as exc:
            raise InvalidAdjustmentPayloadError from exc


async def record_payment(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    actor_user_id: UUID,
    sale_id: UUID,
    amount: int,
    currency: str,
    method: str,
    idempotency_key: str,
) -> dict:
    """Client-found production bug (2026-07-16): this used to accept a
    payment against an already-cancelled sale, and never checked the amount
    against what was actually still owed -- a typo'd payment could overshoot
    the charge and the ledger would just silently show a negative balance as
    "fully paid." Both are now hard-blocked; the currency check guards a
    third, related latent bug -- get_ledger_balance_by_sale sums `amount`
    across a sale's ledger with no currency filter, so a payment recorded in
    the wrong currency would have silently corrupted that sum.

    Security-audit fix (2026-07-18): fetches the sale with FOR UPDATE
    (get_sale_summary_for_update), not a plain SELECT -- without a lock, two
    concurrent record_payment calls on the same sale could both read the same
    pre-payment balance and both pass the overpayment check below, together
    overshooting the actual balance. Locking the sale row serializes
    concurrent payments on it; each one only sees the balance after any
    earlier payment in the same race has actually committed."""
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_summary_for_update(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        if sale["status"] == "cancelled":
            raise SaleCancelledError
        if currency != sale["currency"]:
            raise PaymentCurrencyMismatchError
        row = await repository.insert_payment(
            conn, tenant_id, sale_id, amount, currency, method, idempotency_key, actor_user_id
        )
        if row is not None:
            # Balance as of just before this payment -- checked only on a
            # genuinely fresh insert (this branch), never on an idempotent
            # replay (the `else` below), so retrying an already-successful
            # payment can't spuriously fail just because the balance it
            # already paid down is now lower.
            balance = await repository.get_ledger_balance_by_sale(conn, sale_id)
            if amount > balance:
                raise PaymentExceedsBalanceError
            await repository.insert_ledger_entry(
                conn, tenant_id, sale_id, sale["customer_id"], "payment", -amount, currency, row["id"], None, None, actor_user_id
            )
            return row
        existing = await repository.get_payment_by_idempotency_key(conn, idempotency_key)
        if (
            existing is not None
            and existing["sale_id"] == sale_id
            and existing["amount"] == amount
            and existing["currency"] == currency
            and existing["method"] == method
        ):
            return existing
        raise IdempotencyKeyReusedError


async def reverse_payment(pool: asyncpg.Pool, tenant_id: UUID, actor_user_id: UUID, payment_id: UUID) -> dict:
    """One-click undo for a mistakenly-entered payment (client requirement,
    2026-07-16, found via a real overpayment in production) -- posts a
    compensating `adjustment` ledger entry (the ledger is append-only, see
    CLAUDE.md's Money section: corrections are never UPDATE/DELETE on
    existing financial rows) and marks the payment reversed so it can't be
    reversed twice. Deliberately lighter-weight than the formal
    adjustment_requests/refund approval workflow -- this is for the actor's
    own data-entry mistake, not a customer-facing refund dispute, so it's
    gated the same as recording the payment in the first place
    (finance.manage), not finance.approve."""
    async with tenant_connection(pool, tenant_id) as conn:
        payment = await repository.get_payment_by_id(conn, payment_id)
        if payment is None:
            raise PaymentNotFoundError
        if payment["reversed_at"] is not None:
            raise PaymentAlreadyReversedError
        sale = await repository.get_sale_summary(conn, payment["sale_id"])
        if sale is None:
            raise SaleNotFoundError
        marked = await repository.mark_payment_reversed(conn, payment_id)
        if marked is None:
            raise PaymentAlreadyReversedError
        return await repository.insert_ledger_entry(
            conn,
            tenant_id,
            payment["sale_id"],
            sale["customer_id"],
            "adjustment",
            payment["amount"],
            payment["currency"],
            payment["id"],
            None,
            "Payment reversal (mistaken entry)",
            actor_user_id,
        )


def _assert_sale_owned_or_view_all(sale: dict, caller_id: UUID, can_view_all: bool) -> None:
    """Own-data scoping (2026-07-22): a sale's financial trail (payments,
    ledger) is visible only to whoever is responsible for that sale, unless
    the caller holds finance.view_all -- see customers/service.py's
    identically-named helper for the full 404-not-403 rationale."""
    if can_view_all:
        return
    if sale["responsible_user_id"] == caller_id:
        return
    raise SaleNotFoundError


async def list_payments(
    pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_summary(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        _assert_sale_owned_or_view_all(sale, caller_id, can_view_all)
        return await repository.list_payments_by_sale(conn, sale_id)


async def get_sale_ledger(
    pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID, caller_id: UUID, can_view_all: bool
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_summary(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        _assert_sale_owned_or_view_all(sale, caller_id, can_view_all)
        entries = await repository.list_ledger_entries_by_sale(conn, sale_id)
        balance = await repository.get_ledger_balance_by_sale(conn, sale_id)
    return {"entries": entries, "balance": balance}


async def get_customer_outstanding_sales(
    pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    """Every one of this customer's non-cancelled sales that still has a
    positive ledger balance -- the "which of their past purchases still owes
    money, and how much" list the New Sale flow checks before letting the
    user create a fresh sale, so a payment doesn't get miscategorized as a
    new purchase."""
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_customer_outstanding_sales(conn, customer_id, caller_id, can_view_all)


async def get_profit_summary(
    pool: asyncpg.Pool, tenant_id: UUID, period_start: datetime, period_end: datetime
) -> list[dict]:
    """Umumiy daromad va foyda: per currency, revenue is the contracted price
    of every non-cancelled sale created in the period, cost is the sale's
    product cost_price_amount * quantity (only counted when the product's
    cost_price_currency matches the sale's currency -- a sale with no
    product_id (freeform/category-only), or a currency mismatch, contributes
    0 cost rather than raising, since cost tracking is opt-in per product)."""
    async with tenant_connection(pool, tenant_id) as conn:
        rows = await repository.get_profit_summary_by_currency(conn, period_start, period_end)
    return [{**row, "profit": row["revenue"] - row["cost"]} for row in rows]


async def create_adjustment_request(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    sale_id: UUID,
    requested_by_user_id: UUID,
    adjustment_type: str,
    payload: dict,
    idempotency_key: str,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_summary(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        if adjustment_type == "refund":
            refund_amount = _validate_refund_payload(payload)
            net_collected = await repository.get_net_collected_by_sale(conn, sale_id)
            if refund_amount > net_collected:
                raise RefundExceedsCollectedAmountError
        else:
            _validate_tariff_change_payload(payload)
            payload = {**payload, "sale_version_at_request": sale["version"]}
        row = await repository.insert_adjustment_request(
            conn, tenant_id, sale_id, requested_by_user_id, adjustment_type, payload, idempotency_key
        )
        if row is not None:
            return row
        existing = await repository.get_adjustment_request_by_idempotency_key(conn, idempotency_key)
        if existing is not None and existing["sale_id"] == sale_id and existing["type"] == adjustment_type:
            return existing
        raise IdempotencyKeyReusedError


async def get_adjustment_request(
    pool: asyncpg.Pool, tenant_id: UUID, request_id: UUID, caller_id: UUID, can_view_all: bool
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        request = await repository.get_adjustment_request_by_id(conn, request_id)
    if request is None:
        raise AdjustmentRequestNotFoundError
    if not can_view_all and request["sale_responsible_user_id"] != caller_id:
        raise AdjustmentRequestNotFoundError
    return request


async def list_adjustment_requests(
    pool: asyncpg.Pool, tenant_id: UUID, status: str | None, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_adjustment_requests(conn, status, caller_id, can_view_all)


async def approve_adjustment_request(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    request_id: UUID,
    reviewer_user_id: UUID,
    expected_version: int,
    review_reason: str | None,
    idempotency_key: str,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        req = await repository.get_adjustment_request_by_id(conn, request_id)
        if req is None:
            raise AdjustmentRequestNotFoundError
        if req["status"] != "pending":
            if req["status"] == "approved" and req["review_idempotency_key"] == idempotency_key:
                return req
            raise AdjustmentRequestConflictError
        if req["type"] == "refund":
            net_collected = await repository.get_net_collected_by_sale(conn, req["sale_id"])
            if req["payload"]["refund_amount"] > net_collected:
                raise RefundExceedsCollectedAmountError
        approved = await repository.update_adjustment_request_status(
            conn, request_id, "approved", reviewer_user_id, review_reason, idempotency_key, expected_version
        )
        if approved is None:
            raise AdjustmentRequestConflictError
        if req["type"] == "refund":
            sale = await repository.get_sale_summary(conn, req["sale_id"])
            refund_amount = req["payload"]["refund_amount"]
            refund = await repository.insert_refund(
                conn, tenant_id, req["sale_id"], request_id, refund_amount, sale["currency"], reviewer_user_id
            )
            await repository.insert_ledger_entry(
                conn,
                tenant_id,
                req["sale_id"],
                sale["customer_id"],
                "refund",
                refund_amount,
                sale["currency"],
                None,
                refund["id"],
                f"Refund for adjustment_request {request_id}",
                reviewer_user_id,
            )
            return approved

    # tariff_change mutates the sale via sales.service, in its own transaction --
    # there is no cross-module shared-transaction primitive in this codebase, so
    # this is a second, separate transaction from the status flip above. If it
    # fails (the sale's version moved since the request was filed), the request
    # is left approved with no sale mutation and the caller gets a 409 requiring
    # manual reconciliation.
    new_deadline_str = req["payload"].get("new_deadline")
    try:
        await sales_service.apply_tariff_change(
            pool,
            tenant_id,
            req["sale_id"],
            reviewer_user_id,
            req["payload"].get("new_price_amount"),
            datetime.fromisoformat(new_deadline_str) if new_deadline_str is not None else None,
            req["payload"]["sale_version_at_request"],
            review_reason or f"adjustment_request {request_id} approved",
        )
    except (sales_service.SaleVersionConflictError, sales_service.SaleNotFoundError) as exc:
        raise AdjustmentApplyConflictError from exc
    return approved


async def reject_adjustment_request(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    request_id: UUID,
    reviewer_user_id: UUID,
    expected_version: int,
    review_reason: str | None,
    idempotency_key: str,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        req = await repository.get_adjustment_request_by_id(conn, request_id)
        if req is None:
            raise AdjustmentRequestNotFoundError
        if req["status"] != "pending":
            if req["status"] == "rejected" and req["review_idempotency_key"] == idempotency_key:
                return req
            raise AdjustmentRequestConflictError
        rejected = await repository.update_adjustment_request_status(
            conn, request_id, "rejected", reviewer_user_id, review_reason, idempotency_key, expected_version
        )
        if rejected is None:
            raise AdjustmentRequestConflictError
        return rejected


async def create_bonus_plan(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    name: str,
    applies_to_role_id: UUID,
    bonus_type: str,
    commission_bps: int,
    fixed_amount: int | None,
    fixed_amount_currency: str | None,
    catalog_category_id: UUID | None,
    effective_from: datetime,
    effective_to: datetime | None,
    idempotency_key: str,
) -> dict:
    if bonus_type == "fixed_per_sale" and (fixed_amount is None or fixed_amount_currency is None):
        raise InvalidBonusPlanError
    if bonus_type == "percent" and (fixed_amount is not None or fixed_amount_currency is not None):
        raise InvalidBonusPlanError
    async with tenant_connection(pool, tenant_id) as conn:
        if not await repository.role_exists(conn, applies_to_role_id):
            raise RoleNotFoundError
        if catalog_category_id is not None and not await repository.category_exists(conn, catalog_category_id):
            raise CategoryNotFoundError
        row = await repository.insert_bonus_plan(
            conn,
            tenant_id,
            name,
            applies_to_role_id,
            bonus_type,
            commission_bps,
            fixed_amount,
            fixed_amount_currency,
            catalog_category_id,
            effective_from,
            effective_to,
            idempotency_key,
        )
        if row is not None:
            return row
        existing = await repository.get_bonus_plan_by_idempotency_key(conn, idempotency_key)
        if (
            existing is not None
            and existing["name"] == name
            and existing["applies_to_role_id"] == applies_to_role_id
            and existing["bonus_type"] == bonus_type
            and existing["commission_bps"] == commission_bps
            and existing["fixed_amount"] == fixed_amount
            and existing["fixed_amount_currency"] == fixed_amount_currency
            and existing["catalog_category_id"] == catalog_category_id
            and existing["effective_from"] == effective_from
            and existing["effective_to"] == effective_to
        ):
            return existing
        raise IdempotencyKeyReusedError


async def list_bonus_plans(pool: asyncpg.Pool, tenant_id: UUID, limit: int = 50, offset: int = 0) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_bonus_plans(conn, limit, offset)


def _bonus_for_row(row: dict, plan: dict | None) -> int:
    if plan is None:
        return 0
    if plan["bonus_type"] == "fixed_per_sale":
        if plan["fixed_amount_currency"] != row["currency"]:
            return 0
        return plan["fixed_amount"] * row["sale_count"]
    return (row["revenue"] * plan["commission_bps"]) // 10000


async def _run_payroll_calculation(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    actor_user_id: UUID,
    period_start: datetime,
    period_end: datetime,
    user_id: UUID | None,
) -> list[dict]:
    """Batched payroll core -- O(1) queries regardless of user count (5
    total: target-user lookup, role lookup, bonus-plan lookup, payments
    lookup, bulk upsert), replacing the old per-user loop (3N queries +
    N upserts). Callable with any already-open tenant-scoped connection, so
    both the synchronous caller and the background worker can share it."""
    if user_id is not None:
        if not await repository.user_exists(conn, user_id):
            raise UserNotFoundError
        target_user_ids = [user_id]
    else:
        target_user_ids = await repository.list_users_with_payments_in_period(conn, period_start, period_end)
    if not target_user_ids:
        return []

    role_by_user = await repository.get_user_role_ids_bulk(conn, target_user_ids)
    distinct_role_ids = list({r for r in role_by_user.values() if r is not None})
    if not distinct_role_ids:
        return []

    plans = await repository.get_applicable_bonus_plans_bulk(conn, distinct_role_ids, period_start, period_end)
    # Category-specific plans take precedence over the general (no category)
    # plan for sales in that category -- they don't stack. Plans arrive
    # ordered by applies_to_role_id, catalog_category_id NULLS LAST,
    # effective_from DESC, so the first plan seen per (role, category) is
    # the one currently in effect.
    plans_by_role: dict[UUID, dict] = {}
    for plan in plans:
        bucket = plans_by_role.setdefault(plan["applies_to_role_id"], {"category_plans": {}, "general_plan": None})
        cat_id = plan["catalog_category_id"]
        if cat_id is None:
            if bucket["general_plan"] is None:
                bucket["general_plan"] = plan
        elif cat_id not in bucket["category_plans"]:
            bucket["category_plans"][cat_id] = plan

    rows = await repository.get_collected_payments_by_user_category_currency_bulk(
        conn, target_user_ids, period_start, period_end
    )

    base_by_key: dict[tuple[UUID, str], int] = {}
    bonus_by_key: dict[tuple[UUID, str], int] = {}
    plan_ids_by_key: dict[tuple[UUID, str], set[UUID]] = {}
    for row in rows:
        uid = row["user_id"]
        role_id = role_by_user.get(uid)
        bucket = plans_by_role.get(role_id) if role_id is not None else None
        plan = bucket["category_plans"].get(row["catalog_category_id"], bucket["general_plan"]) if bucket else None
        key = (uid, row["currency"])
        base_by_key[key] = base_by_key.get(key, 0) + row["revenue"]
        bonus_by_key[key] = bonus_by_key.get(key, 0) + _bonus_for_row(row, plan)
        if plan is not None:
            plan_ids_by_key.setdefault(key, set()).add(plan["id"])

    if not base_by_key:
        return []

    upsert_user_ids: list[UUID] = []
    upsert_bonus_plan_ids: list[UUID | None] = []
    upsert_base_amounts: list[int] = []
    upsert_bonus_amounts: list[int] = []
    upsert_currencies: list[str] = []
    for (uid, currency), base_amount in base_by_key.items():
        plan_ids = plan_ids_by_key.get((uid, currency), set())
        upsert_user_ids.append(uid)
        upsert_bonus_plan_ids.append(next(iter(plan_ids)) if len(plan_ids) == 1 else None)
        upsert_base_amounts.append(base_amount)
        upsert_bonus_amounts.append(bonus_by_key.get((uid, currency), 0))
        upsert_currencies.append(currency)

    return await repository.upsert_payroll_entries_bulk(
        conn,
        tenant_id,
        period_start,
        period_end,
        upsert_user_ids,
        upsert_bonus_plan_ids,
        upsert_base_amounts,
        upsert_bonus_amounts,
        upsert_currencies,
        actor_user_id,
    )


async def calculate_payroll(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    actor_user_id: UUID,
    period_start: datetime,
    period_end: datetime,
    user_id: UUID | None,
) -> list[dict]:
    if period_end <= period_start:
        raise InvalidPeriodError
    async with tenant_connection(pool, tenant_id) as conn:
        return await _run_payroll_calculation(conn, tenant_id, actor_user_id, period_start, period_end, user_id)


async def enqueue_payroll_calculation(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    actor_user_id: UUID,
    period_start: datetime,
    period_end: datetime,
    user_id: UUID | None,
) -> dict:
    """Validates and records the request as a payroll_calculation_jobs row
    (status=pending) instead of computing synchronously -- payroll_worker.py
    picks it up and calls _run_payroll_calculation. Keeps the HTTP request
    fast even for a slow/large tenant, and keeps the single event loop free
    for every other tenant's requests while it runs."""
    if period_end <= period_start:
        raise InvalidPeriodError
    async with tenant_connection(pool, tenant_id) as conn:
        if user_id is not None and not await repository.user_exists(conn, user_id):
            raise UserNotFoundError
        return await repository.insert_payroll_job(
            conn, tenant_id, period_start, period_end, user_id, actor_user_id
        )


async def get_payroll_job(pool: asyncpg.Pool, tenant_id: UUID, job_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        job = await repository.get_payroll_job(conn, job_id)
    if job is None:
        raise PayrollJobNotFoundError
    return job


async def list_payroll_entries(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    user_id: UUID | None,
    caller_id: UUID,
    can_view_all: bool,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_payroll_entries(conn, user_id, caller_id, can_view_all, limit, offset)
