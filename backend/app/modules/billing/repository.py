from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


async def list_billing_plans(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_billing_plans(conn)]
    return _rows(rows)


async def get_billing_plan_by_code(conn: asyncpg.Connection, code: str) -> dict | None:
    row = await _queries.get_billing_plan_by_code(conn, code=code)
    return _row(row)


async def get_billing_plan_by_id(conn: asyncpg.Connection, billing_plan_id: UUID) -> dict | None:
    row = await _queries.get_billing_plan_by_id(conn, billing_plan_id=billing_plan_id)
    return _row(row)


async def update_billing_plan(
    conn: asyncpg.Connection,
    code: str,
    price_amount: int | None,
    currency: str | None,
    max_users: int | None,
    max_billable_storage_bytes: int | None,
    is_active: bool | None,
) -> dict | None:
    row = await _queries.update_billing_plan(
        conn,
        code=code,
        price_amount=price_amount,
        currency=currency,
        max_users=max_users,
        max_billable_storage_bytes=max_billable_storage_bytes,
        is_active=is_active,
    )
    return _row(row)


async def get_tenant_subscription(conn: asyncpg.Connection, tenant_id: UUID) -> dict | None:
    row = await _queries.get_tenant_subscription(conn, tenant_id=tenant_id)
    return _row(row)


async def upsert_tenant_subscription(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    billing_plan_id: UUID,
    current_period_start: datetime,
    current_period_end: datetime,
) -> dict:
    row = await _queries.upsert_tenant_subscription(
        conn,
        tenant_id=tenant_id,
        billing_plan_id=billing_plan_id,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
    )
    return _row(row)


async def extend_tenant_subscription_period(
    conn: asyncpg.Connection, tenant_id: UUID, current_period_start: datetime, current_period_end: datetime
) -> dict | None:
    row = await _queries.extend_tenant_subscription_period(
        conn, tenant_id=tenant_id, current_period_start=current_period_start, current_period_end=current_period_end
    )
    return _row(row)


async def set_storage_warning_flags(
    conn: asyncpg.Connection, tenant_id: UUID, warning_80_sent_at: datetime | None, warning_100_sent_at: datetime | None
) -> dict | None:
    row = await _queries.set_storage_warning_flags(
        conn, tenant_id=tenant_id, warning_80_sent_at=warning_80_sent_at, warning_100_sent_at=warning_100_sent_at
    )
    return _row(row)


async def insert_subscription_payment(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    tenant_subscription_id: UUID,
    billing_plan_id: UUID,
    provider: str,
    amount: int,
    currency: str,
    period_start: datetime,
    period_end: datetime,
    idempotency_key: str,
    created_by_user_id: UUID | None,
    created_by_admin_id: UUID | None,
) -> dict | None:
    row = await _queries.insert_subscription_payment(
        conn,
        tenant_id=tenant_id,
        tenant_subscription_id=tenant_subscription_id,
        billing_plan_id=billing_plan_id,
        provider=provider,
        amount=amount,
        currency=currency,
        period_start=period_start,
        period_end=period_end,
        idempotency_key=idempotency_key,
        created_by_user_id=created_by_user_id,
        created_by_admin_id=created_by_admin_id,
    )
    return _row(row)


async def get_subscription_payment_by_idempotency_key(conn: asyncpg.Connection, idempotency_key: str) -> dict | None:
    row = await _queries.get_subscription_payment_by_idempotency_key(conn, idempotency_key=idempotency_key)
    return _row(row)


async def get_subscription_payment_by_id(conn: asyncpg.Connection, payment_id: UUID) -> dict | None:
    row = await _queries.get_subscription_payment_by_id(conn, payment_id=payment_id)
    return _row(row)


async def get_subscription_payment_by_provider_txn(
    conn: asyncpg.Connection, provider: str, provider_transaction_id: str
) -> dict | None:
    row = await _queries.get_subscription_payment_by_provider_txn(
        conn, provider=provider, provider_transaction_id=provider_transaction_id
    )
    return _row(row)


async def list_subscription_payments(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_subscription_payments(conn)]
    return _rows(rows)


async def set_subscription_payment_provider_transaction(
    conn: asyncpg.Connection, payment_id: UUID, provider_transaction_id: str, provider_state: int | None
) -> dict | None:
    row = await _queries.set_subscription_payment_provider_transaction(
        conn, payment_id=payment_id, provider_transaction_id=provider_transaction_id, provider_state=provider_state
    )
    return _row(row)


async def mark_subscription_payment_paid(
    conn: asyncpg.Connection, payment_id: UUID, provider_state: int | None, review_idempotency_key: str | None
) -> dict | None:
    row = await _queries.mark_subscription_payment_paid(
        conn, payment_id=payment_id, provider_state=provider_state, review_idempotency_key=review_idempotency_key
    )
    return _row(row)


async def mark_subscription_payment_cancelled(
    conn: asyncpg.Connection,
    payment_id: UUID,
    provider_state: int | None,
    cancel_reason: int | None,
    review_idempotency_key: str | None,
) -> dict | None:
    row = await _queries.mark_subscription_payment_cancelled(
        conn,
        payment_id=payment_id,
        provider_state=provider_state,
        cancel_reason=cancel_reason,
        review_idempotency_key=review_idempotency_key,
    )
    return _row(row)


async def insert_subscription_payment_provider_ref(
    conn: asyncpg.Connection, provider: str, provider_transaction_id: str, tenant_id: UUID, subscription_payment_id: UUID
) -> dict | None:
    row = await _queries.insert_subscription_payment_provider_ref(
        conn,
        provider=provider,
        provider_transaction_id=provider_transaction_id,
        tenant_id=tenant_id,
        subscription_payment_id=subscription_payment_id,
    )
    return _row(row)


async def get_subscription_payment_provider_ref(
    conn: asyncpg.Connection, provider: str, provider_transaction_id: str
) -> dict | None:
    row = await _queries.get_subscription_payment_provider_ref(
        conn, provider=provider, provider_transaction_id=provider_transaction_id
    )
    return _row(row)


async def upsert_storage_usage_snapshot(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    db_bytes: int,
    object_storage_bytes: int,
    total_bytes: int,
    billable_storage_limit_bytes: int,
    usage_ratio_bps: int,
) -> dict:
    row = await _queries.upsert_storage_usage_snapshot(
        conn,
        tenant_id=tenant_id,
        db_bytes=db_bytes,
        object_storage_bytes=object_storage_bytes,
        total_bytes=total_bytes,
        billable_storage_limit_bytes=billable_storage_limit_bytes,
        usage_ratio_bps=usage_ratio_bps,
    )
    return _row(row)


async def get_latest_storage_usage_snapshot(conn: asyncpg.Connection) -> dict | None:
    row = await _queries.get_latest_storage_usage_snapshot(conn)
    return _row(row)


async def compute_tenant_db_bytes(conn: asyncpg.Connection) -> int:
    row = await _queries.compute_tenant_db_bytes(conn)
    return row["db_bytes"]
