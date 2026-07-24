"""Stuck-job recovery (M3): the payroll and export workers requeue jobs that a
crashed worker left stuck in 'processing'. These drive the real repository
requeue functions against a live DB (as the RLS-scoped app_user), asserting a
stale 'processing' job is flipped back to 'pending' while a fresh one is left
alone.
"""

from datetime import date

from app.core.database import tenant_connection
from app.modules.finance import repository as finance_repository
from app.modules.reports import repository as reports_repository

_STALE_SECONDS = 5


async def _insert_payroll_job(owner_conn, tenant_id, user_id, *, age_seconds: int):
    return await owner_conn.fetchval(
        """
        INSERT INTO payroll_calculation_jobs
            (tenant_id, period_start, period_end, requested_by_user_id, status, started_at)
        VALUES ($1, $2, $3, $4, 'processing', now() - make_interval(secs => $5))
        RETURNING id
        """,
        tenant_id, date(2026, 1, 1), date(2026, 1, 31), user_id, float(age_seconds),
    )


async def _insert_export_job(owner_conn, tenant_id, user_id, *, age_seconds: int):
    return await owner_conn.fetchval(
        """
        INSERT INTO report_export_jobs
            (tenant_id, entity, format, requested_by_user_id, status, started_at)
        VALUES ($1, 'sales', 'csv', $2, 'processing', now() - make_interval(secs => $3))
        RETURNING id
        """,
        tenant_id, user_id, float(age_seconds),
    )


async def _status(owner_conn, table, job_id):
    return await owner_conn.fetchval(f"SELECT status FROM {table} WHERE id = $1", job_id)


async def test_requeues_stale_but_not_fresh_payroll_job(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user_a = tenant_users[tenant_a]
    stale = await _insert_payroll_job(owner_conn, tenant_a, user_a, age_seconds=3600)
    fresh = await _insert_payroll_job(owner_conn, tenant_a, user_a, age_seconds=0)

    async with tenant_connection(app_pool, tenant_a) as conn:
        requeued = await finance_repository.requeue_stale_processing_payroll_jobs(conn, _STALE_SECONDS)

    requeued_ids = {r["id"] for r in requeued}
    assert stale in requeued_ids and fresh not in requeued_ids
    assert await _status(owner_conn, "payroll_calculation_jobs", stale) == "pending"
    assert await _status(owner_conn, "payroll_calculation_jobs", fresh) == "processing"


async def test_requeues_stale_but_not_fresh_export_job(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user_a = tenant_users[tenant_a]
    stale = await _insert_export_job(owner_conn, tenant_a, user_a, age_seconds=3600)
    fresh = await _insert_export_job(owner_conn, tenant_a, user_a, age_seconds=0)

    async with tenant_connection(app_pool, tenant_a) as conn:
        requeued = await reports_repository.requeue_stale_processing_export_jobs(conn, _STALE_SECONDS)

    requeued_ids = {r["id"] for r in requeued}
    assert stale in requeued_ids and fresh not in requeued_ids
    assert await _status(owner_conn, "report_export_jobs", stale) == "pending"
    assert await _status(owner_conn, "report_export_jobs", fresh) == "processing"


async def test_requeue_respects_tenant_isolation(app_pool, owner_conn, two_tenants, tenant_users):
    # A stale job belonging to tenant B must not be requeued while operating in
    # tenant A's context — the reaper runs through the RLS-scoped connection.
    tenant_a, tenant_b = two_tenants
    b_job = await _insert_payroll_job(owner_conn, tenant_b, tenant_users[tenant_b], age_seconds=3600)

    async with tenant_connection(app_pool, tenant_a) as conn:
        requeued = await finance_repository.requeue_stale_processing_payroll_jobs(conn, _STALE_SECONDS)

    assert b_job not in {r["id"] for r in requeued}
    assert await _status(owner_conn, "payroll_calculation_jobs", b_job) == "processing"
