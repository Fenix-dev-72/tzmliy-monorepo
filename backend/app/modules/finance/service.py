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


class InvalidPeriodError(Exception):
    pass


class UserNotFoundError(Exception):
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
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_summary(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        row = await repository.insert_payment(
            conn, tenant_id, sale_id, amount, currency, method, idempotency_key, actor_user_id
        )
        if row is not None:
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


async def list_payments(pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_sale_summary(conn, sale_id) is None:
            raise SaleNotFoundError
        return await repository.list_payments_by_sale(conn, sale_id)


async def get_sale_ledger(pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_sale_summary(conn, sale_id) is None:
            raise SaleNotFoundError
        entries = await repository.list_ledger_entries_by_sale(conn, sale_id)
        balance = await repository.get_ledger_balance_by_sale(conn, sale_id)
    return {"entries": entries, "balance": balance}


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


async def get_adjustment_request(pool: asyncpg.Pool, tenant_id: UUID, request_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        request = await repository.get_adjustment_request_by_id(conn, request_id)
    if request is None:
        raise AdjustmentRequestNotFoundError
    return request


async def list_adjustment_requests(pool: asyncpg.Pool, tenant_id: UUID, status: str | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_adjustment_requests(conn, status)


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
    commission_bps: int,
    effective_from: datetime,
    effective_to: datetime | None,
    idempotency_key: str,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if not await repository.role_exists(conn, applies_to_role_id):
            raise RoleNotFoundError
        row = await repository.insert_bonus_plan(
            conn, tenant_id, name, applies_to_role_id, commission_bps, effective_from, effective_to, idempotency_key
        )
        if row is not None:
            return row
        existing = await repository.get_bonus_plan_by_idempotency_key(conn, idempotency_key)
        if (
            existing is not None
            and existing["name"] == name
            and existing["applies_to_role_id"] == applies_to_role_id
            and existing["commission_bps"] == commission_bps
            and existing["effective_from"] == effective_from
            and existing["effective_to"] == effective_to
        ):
            return existing
        raise IdempotencyKeyReusedError


async def list_bonus_plans(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_bonus_plans(conn)


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
        if user_id is not None:
            if not await repository.user_exists(conn, user_id):
                raise UserNotFoundError
            target_user_ids = [user_id]
        else:
            target_user_ids = await repository.list_users_with_payments_in_period(conn, period_start, period_end)

        results = []
        for uid in target_user_ids:
            role_id = await repository.get_user_role_id(conn, uid)
            if role_id is None:
                continue
            plan = await repository.get_applicable_bonus_plan(conn, role_id, period_start, period_end)
            if plan is None:
                continue
            collected = await repository.get_collected_payments_by_currency(conn, uid, period_start, period_end)
            for row in collected:
                base_amount = row["total"]
                bonus_amount = (base_amount * plan["commission_bps"]) // 10000
                entry = await repository.upsert_payroll_entry(
                    conn,
                    tenant_id,
                    uid,
                    period_start,
                    period_end,
                    plan["id"],
                    base_amount,
                    bonus_amount,
                    row["currency"],
                    actor_user_id,
                )
                results.append(entry)
        return results


async def list_payroll_entries(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_payroll_entries(conn, user_id)
