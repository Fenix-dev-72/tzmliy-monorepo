"""Platform Admin "System Issues" view (2026-08-11): aggregates failures the
system already tracks (Telegram delivery dead-letters, failed report
exports, failed payroll jobs, the daily backup's last-run status)
cross-tenant into one list, separate from complaints.list_complaints
(user-submitted). Exercises platform_dashboard.service.list_system_issues
directly against the real tables.
"""

from uuid import uuid4

import pytest

from app.modules.platform_dashboard import service


@pytest.fixture(autouse=True)
async def _cleanup(owner_conn, two_tenants):
    yield
    ids = list(two_tenants)
    await owner_conn.execute("DELETE FROM notification_outbox WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM report_export_jobs WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM payroll_calculation_jobs WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM backup_settings WHERE id = 1")


async def _insert_user(owner_conn, tenant_id) -> str:
    role_id = await owner_conn.fetchval(
        "INSERT INTO roles (tenant_id, name) VALUES ($1, 'agent') RETURNING id", tenant_id
    )
    return await owner_conn.fetchval(
        "INSERT INTO users (tenant_id, email, password_hash, role_id) VALUES ($1, $2, 'x', $3) RETURNING id",
        tenant_id,
        f"issues-test-{uuid4().hex}@example.test",
        role_id,
    )


async def test_list_system_issues_aggregates_all_sources(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    user_id = await _insert_user(owner_conn, tenant_a)

    await owner_conn.execute(
        """
        INSERT INTO notification_outbox (tenant_id, channel, telegram_chat_id, text_body, status, last_error)
        VALUES ($1, 'telegram_message', 1, 'hi', 'dead_letter', 'bot blocked')
        """,
        tenant_a,
    )
    await owner_conn.execute(
        """
        INSERT INTO report_export_jobs (tenant_id, entity, format, status, error, requested_by_user_id)
        VALUES ($1, 'sales', 'csv', 'failed', 'disk full', $2)
        """,
        tenant_a,
        user_id,
    )
    await owner_conn.execute(
        """
        INSERT INTO payroll_calculation_jobs
            (tenant_id, period_start, period_end, status, error, requested_by_user_id)
        VALUES ($1, now() - interval '30 days', now(), 'failed', 'division by zero', $2)
        """,
        tenant_a,
        user_id,
    )
    await owner_conn.execute(
        """
        INSERT INTO backup_settings (id, last_backup_at, last_backup_status, last_backup_error)
        VALUES (1, now(), 'failed', 'telegram send failed')
        ON CONFLICT (id) DO UPDATE SET last_backup_at = now(), last_backup_status = 'failed', last_backup_error = 'telegram send failed'
        """
    )

    issues = await service.list_system_issues(app_pool)
    sources = {i["source"] for i in issues}
    assert {"notification", "report_export", "payroll", "backup"} <= sources

    notification_issue = next(i for i in issues if i["source"] == "notification")
    assert notification_issue["tenant_id"] == tenant_a
    assert notification_issue["detail"] == "bot blocked"

    backup_issue = next(i for i in issues if i["source"] == "backup")
    assert backup_issue["tenant_id"] is None
    assert backup_issue["detail"] == "telegram send failed"


async def test_list_system_issues_excludes_successful_backup(app_pool, owner_conn):
    await owner_conn.execute(
        """
        INSERT INTO backup_settings (id, last_backup_at, last_backup_status)
        VALUES (1, now(), 'success')
        ON CONFLICT (id) DO UPDATE SET last_backup_at = now(), last_backup_status = 'success', last_backup_error = NULL
        """
    )
    issues = await service.list_system_issues(app_pool)
    assert all(i["source"] != "backup" for i in issues)
