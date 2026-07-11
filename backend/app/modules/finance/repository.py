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


async def list_adjustment_requests(conn: asyncpg.Connection, status: str | None) -> list[dict]:
    rows = [row async for row in _queries.list_adjustment_requests(conn, status=status)]
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
    commission_bps: int,
    effective_from: datetime,
    effective_to: datetime | None,
    idempotency_key: str,
) -> dict | None:
    row = await _queries.insert_bonus_plan(
        conn,
        tenant_id=tenant_id,
        name=name,
        applies_to_role_id=applies_to_role_id,
        commission_bps=commission_bps,
        effective_from=effective_from,
        effective_to=effective_to,
        idempotency_key=idempotency_key,
    )
    return _row(row)


async def get_bonus_plan_by_idempotency_key(conn: asyncpg.Connection, idempotency_key: str) -> dict | None:
    row = await _queries.get_bonus_plan_by_idempotency_key(conn, idempotency_key=idempotency_key)
    return _row(row)


async def list_bonus_plans(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_bonus_plans(conn)]
    return [dict(r) for r in rows]


async def get_applicable_bonus_plan(
    conn: asyncpg.Connection, role_id: UUID, period_start: datetime, period_end: datetime
) -> dict | None:
    row = await _queries.get_applicable_bonus_plan(
        conn, role_id=role_id, period_start=period_start, period_end=period_end
    )
    return _row(row)


async def role_exists(conn: asyncpg.Connection, role_id: UUID) -> bool:
    row = await _queries.role_exists(conn, role_id=role_id)
    return row["exists"]


async def get_user_role_id(conn: asyncpg.Connection, user_id: UUID) -> UUID | None:
    row = await _queries.get_user_role_id(conn, user_id=user_id)
    return row["role_id"] if row is not None else None


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


async def get_collected_payments_by_currency(
    conn: asyncpg.Connection, user_id: UUID, period_start: datetime, period_end: datetime
) -> list[dict]:
    rows = [
        row
        async for row in _queries.get_collected_payments_by_currency(
            conn, user_id=user_id, period_start=period_start, period_end=period_end
        )
    ]
    return [dict(r) for r in rows]


async def upsert_payroll_entry(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    user_id: UUID,
    period_start: datetime,
    period_end: datetime,
    bonus_plan_id: UUID,
    base_amount: int,
    bonus_amount: int,
    currency: str,
    computed_by_user_id: UUID,
) -> dict:
    row = await _queries.upsert_payroll_entry(
        conn,
        tenant_id=tenant_id,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        bonus_plan_id=bonus_plan_id,
        base_amount=base_amount,
        bonus_amount=bonus_amount,
        currency=currency,
        computed_by_user_id=computed_by_user_id,
    )
    return _row(row)


async def list_payroll_entries(conn: asyncpg.Connection, user_id: UUID | None) -> list[dict]:
    rows = [row async for row in _queries.list_payroll_entries(conn, user_id=user_id)]
    return [dict(r) for r in rows]
