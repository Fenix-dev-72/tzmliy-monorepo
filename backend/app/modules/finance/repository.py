import json
from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


def _with_payload(record: asyncpg.Record | None) -> dict | None:
    if record is None:
        return None
    result = dict(record)
    result["payload"] = json.loads(result["payload"])
    return result


async def get_sale_summary(conn: asyncpg.Connection, sale_id: UUID) -> dict | None:
    row = await _queries.get_sale_summary(conn, sale_id=sale_id)
    return _row(row)


async def get_sale_summary_for_update(conn: asyncpg.Connection, sale_id: UUID) -> dict | None:
    row = await _queries.get_sale_summary_for_update(conn, sale_id=sale_id)
    return _row(row)


async def insert_payment(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    sale_id: UUID,
    amount: int,
    currency: str,
    method: str,
    idempotency_key: str,
    recorded_by_user_id: UUID,
) -> dict | None:
    row = await _queries.insert_payment(
        conn,
        tenant_id=tenant_id,
        sale_id=sale_id,
        amount=amount,
        currency=currency,
        method=method,
        idempotency_key=idempotency_key,
        recorded_by_user_id=recorded_by_user_id,
    )
    return _row(row)


async def get_payment_by_idempotency_key(conn: asyncpg.Connection, idempotency_key: str) -> dict | None:
    row = await _queries.get_payment_by_idempotency_key(conn, idempotency_key=idempotency_key)
    return _row(row)


async def get_payment_by_id(conn: asyncpg.Connection, payment_id: UUID) -> dict | None:
    row = await _queries.get_payment_by_id(conn, payment_id=payment_id)
    return _row(row)


async def mark_payment_reversed(conn: asyncpg.Connection, payment_id: UUID) -> dict | None:
    row = await _queries.mark_payment_reversed(conn, payment_id=payment_id)
    return _row(row)


async def list_payments_by_sale(conn: asyncpg.Connection, sale_id: UUID) -> list[dict]:
    rows = [row async for row in _queries.list_payments_by_sale(conn, sale_id=sale_id)]
    return [dict(r) for r in rows]


async def insert_ledger_entry(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    sale_id: UUID | None,
    customer_id: UUID | None,
    entry_type: str,
    amount: int,
    currency: str,
    related_payment_id: UUID | None,
    related_refund_id: UUID | None,
    description: str | None,
    created_by_user_id: UUID,
) -> dict:
    row = await _queries.insert_ledger_entry(
        conn,
        tenant_id=tenant_id,
        sale_id=sale_id,
        customer_id=customer_id,
        entry_type=entry_type,
        amount=amount,
        currency=currency,
        related_payment_id=related_payment_id,
        related_refund_id=related_refund_id,
        description=description,
        created_by_user_id=created_by_user_id,
    )
    return _row(row)


async def list_ledger_entries_by_sale(conn: asyncpg.Connection, sale_id: UUID) -> list[dict]:
    rows = [row async for row in _queries.list_ledger_entries_by_sale(conn, sale_id=sale_id)]
    return [dict(r) for r in rows]


async def get_ledger_balance_by_sale(conn: asyncpg.Connection, sale_id: UUID) -> int:
    row = await _queries.get_ledger_balance_by_sale(conn, sale_id=sale_id)
    return row["balance"]


async def get_net_collected_by_sale(conn: asyncpg.Connection, sale_id: UUID) -> int:
    row = await _queries.get_net_collected_by_sale(conn, sale_id=sale_id)
    return row["net_collected"]


async def list_customer_outstanding_sales(
    conn: asyncpg.Connection, customer_id: UUID, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    rows = [
        row
        async for row in _queries.list_customer_outstanding_sales(
            conn, customer_id=customer_id, caller_id=caller_id, can_view_all=can_view_all
        )
    ]
    return [dict(r) for r in rows]


async def insert_adjustment_request(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    sale_id: UUID,
    requested_by_user_id: UUID,
    adjustment_type: str,
    payload: dict,
    idempotency_key: str,
) -> dict | None:
    row = await _queries.insert_adjustment_request(
        conn,
        tenant_id=tenant_id,
        sale_id=sale_id,
        requested_by_user_id=requested_by_user_id,
        type=adjustment_type,
        payload=json.dumps(payload, default=str),
        idempotency_key=idempotency_key,
    )
    return _with_payload(row)


async def get_adjustment_request_by_idempotency_key(conn: asyncpg.Connection, idempotency_key: str) -> dict | None:
    row = await _queries.get_adjustment_request_by_idempotency_key(conn, idempotency_key=idempotency_key)
    return _with_payload(row)


async def get_adjustment_request_by_id(conn: asyncpg.Connection, request_id: UUID) -> dict | None:
    row = await _queries.get_adjustment_request_by_id(conn, request_id=request_id)
    return _with_payload(row)


async def list_adjustment_requests(
    conn: asyncpg.Connection, status: str | None, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    rows = [
        row
        async for row in _queries.list_adjustment_requests(
            conn, status=status, caller_id=caller_id, can_view_all=can_view_all
        )
    ]
    return [_with_payload(r) for r in rows]


async def update_adjustment_request_status(
    conn: asyncpg.Connection,
    request_id: UUID,
    new_status: str,
    reviewer_user_id: UUID,
    review_reason: str | None,
    review_idempotency_key: str,
    expected_version: int,
) -> dict | None:
    row = await _queries.update_adjustment_request_status(
        conn,
        request_id=request_id,
        new_status=new_status,
        reviewer_user_id=reviewer_user_id,
        review_reason=review_reason,
        review_idempotency_key=review_idempotency_key,
        expected_version=expected_version,
    )
    return _with_payload(row)


async def insert_refund(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    sale_id: UUID,
    adjustment_request_id: UUID,
    amount: int,
    currency: str,
    created_by_user_id: UUID,
) -> dict:
    row = await _queries.insert_refund(
        conn,
        tenant_id=tenant_id,
        sale_id=sale_id,
        adjustment_request_id=adjustment_request_id,
        amount=amount,
        currency=currency,
        created_by_user_id=created_by_user_id,
    )
    return _row(row)


async def insert_bonus_plan(
    conn: asyncpg.Connection,
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
) -> dict | None:
    row = await _queries.insert_bonus_plan(
        conn,
        tenant_id=tenant_id,
        name=name,
        applies_to_role_id=applies_to_role_id,
        bonus_type=bonus_type,
        commission_bps=commission_bps,
        fixed_amount=fixed_amount,
        fixed_amount_currency=fixed_amount_currency,
        catalog_category_id=catalog_category_id,
        effective_from=effective_from,
        effective_to=effective_to,
        idempotency_key=idempotency_key,
    )
    return _row(row)


async def get_bonus_plan_by_idempotency_key(conn: asyncpg.Connection, idempotency_key: str) -> dict | None:
    row = await _queries.get_bonus_plan_by_idempotency_key(conn, idempotency_key=idempotency_key)
    return _row(row)


async def list_bonus_plans(conn: asyncpg.Connection, limit: int, offset: int) -> list[dict]:
    rows = [row async for row in _queries.list_bonus_plans(conn, limit=limit, offset=offset)]
    return [dict(r) for r in rows]


async def get_applicable_bonus_plans_bulk(
    conn: asyncpg.Connection, role_ids: list[UUID], period_start: datetime, period_end: datetime
) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_applicable_bonus_plans_bulk(
            conn, role_ids=role_ids, period_start=period_start, period_end=period_end
        )
    ]
    return [dict(r) for r in rows]


async def role_exists(conn: asyncpg.Connection, role_id: UUID) -> bool:
    row = await _queries.role_exists(conn, role_id=role_id)
    return row["exists"]


async def category_exists(conn: asyncpg.Connection, category_id: UUID) -> bool:
    row = await _queries.category_exists(conn, category_id=category_id)
    return row["exists"]


async def get_user_role_ids_bulk(conn: asyncpg.Connection, user_ids: list[UUID]) -> dict[UUID, UUID | None]:
    rows = [row async for row in _queries.get_user_role_ids_bulk(conn, user_ids=user_ids)]
    return {r["user_id"]: r["role_id"] for r in rows}


async def user_exists(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_exists(conn, user_id=user_id)
    return row["exists"]


async def list_users_with_payments_in_period(
    conn: asyncpg.Connection, period_start: datetime, period_end: datetime
) -> list[UUID]:
    rows = [
        row
        async for row in _queries.list_users_with_payments_in_period(
            conn, period_start=period_start, period_end=period_end
        )
    ]
    return [r["user_id"] for r in rows]


async def get_collected_payments_by_user_category_currency_bulk(
    conn: asyncpg.Connection, user_ids: list[UUID], period_start: datetime, period_end: datetime
) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_collected_payments_by_user_category_currency_bulk(
            conn, user_ids=user_ids, period_start=period_start, period_end=period_end
        )
    ]
    return [dict(r) for r in rows]


async def upsert_payroll_entries_bulk(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    period_start: datetime,
    period_end: datetime,
    user_ids: list[UUID],
    bonus_plan_ids: list[UUID | None],
    base_amounts: list[int],
    bonus_amounts: list[int],
    currencies: list[str],
    computed_by_user_id: UUID,
) -> list[dict]:
    rows = [
        row
        async for row in _queries.upsert_payroll_entries_bulk(
            conn,
            tenant_id=tenant_id,
            period_start=period_start,
            period_end=period_end,
            user_ids=user_ids,
            bonus_plan_ids=bonus_plan_ids,
            base_amounts=base_amounts,
            bonus_amounts=bonus_amounts,
            currencies=currencies,
            computed_by_user_id=computed_by_user_id,
        )
    ]
    return [dict(r) for r in rows]


async def list_payroll_entries(
    conn: asyncpg.Connection, user_id: UUID | None, caller_id: UUID, can_view_all: bool, limit: int, offset: int
) -> list[dict]:
    rows = [
        row
        async for row in _queries.list_payroll_entries(
            conn, user_id=user_id, caller_id=caller_id, can_view_all=can_view_all, limit=limit, offset=offset
        )
    ]
    return [dict(r) for r in rows]


async def insert_payroll_job(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    period_start: datetime,
    period_end: datetime,
    user_id: UUID | None,
    requested_by_user_id: UUID,
) -> dict:
    row = await _queries.insert_payroll_job(
        conn,
        tenant_id=tenant_id,
        period_start=period_start,
        period_end=period_end,
        user_id=user_id,
        requested_by_user_id=requested_by_user_id,
    )
    return _row(row)


async def get_payroll_job(conn: asyncpg.Connection, job_id: UUID) -> dict | None:
    row = await _queries.get_payroll_job(conn, job_id=job_id)
    return _row(row)


async def claim_pending_payroll_job(conn: asyncpg.Connection) -> dict | None:
    row = await _queries.claim_pending_payroll_job(conn)
    return _row(row)


async def mark_payroll_job_done(conn: asyncpg.Connection, job_id: UUID) -> None:
    await _queries.mark_payroll_job_done(conn, job_id=job_id)


async def mark_payroll_job_failed(conn: asyncpg.Connection, job_id: UUID, error: str) -> None:
    await _queries.mark_payroll_job_failed(conn, job_id=job_id, error=error)


async def get_profit_summary_by_currency(
    conn: asyncpg.Connection, period_start: datetime, period_end: datetime
) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_profit_summary_by_currency(
            conn, period_start=period_start, period_end=period_end
        )
    ]
    return [dict(r) for r in rows]
