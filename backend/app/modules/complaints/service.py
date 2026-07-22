from uuid import UUID

import asyncpg

from app.core.database import platform_connection
from app.modules.complaints import repository


class ComplaintNotFoundError(Exception):
    pass


async def create_complaint(
    pool: asyncpg.Pool, tenant_id: UUID, created_by_user_id: UUID, subject: str, message: str
) -> dict:
    """complaints carries no RLS (see 0049_complaints.sql's own comment) --
    written via platform_connection even though the caller is a tenant user,
    same "platform-level table written from tenant-authenticated request"
    shape as user_login_identifiers/registration_verifications."""
    async with platform_connection(pool) as conn:
        return await repository.insert_complaint(conn, tenant_id, created_by_user_id, subject, message)


async def list_complaints(pool: asyncpg.Pool, status: str | None) -> list[dict]:
    async with platform_connection(pool) as conn:
        return await repository.list_complaints(conn, status)


async def update_complaint_status(pool: asyncpg.Pool, complaint_id: UUID, new_status: str, admin_id: UUID) -> dict:
    async with platform_connection(pool) as conn:
        existing = await repository.get_complaint_by_id(conn, complaint_id)
        if existing is None:
            raise ComplaintNotFoundError
        updated = await repository.update_complaint_status(conn, complaint_id, new_status, admin_id)
        if updated is None:
            raise ComplaintNotFoundError
        return updated
