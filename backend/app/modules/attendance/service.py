from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.attendance import repository


class AlreadyCheckedInError(Exception):
    pass


class NotCheckedInError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


async def check_in(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        try:
            return await repository.insert_check_in(conn, tenant_id, user_id, None, "manual")
        except asyncpg.UniqueViolationError as exc:
            raise AlreadyCheckedInError from exc


async def check_out(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        row = await repository.check_out(conn, user_id)
        if row is None:
            raise NotCheckedInError
        return row


async def push_attendance(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, check_in_at: datetime | None) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if not await repository.user_exists(conn, user_id):
            raise UserNotFoundError
        try:
            return await repository.insert_check_in(conn, tenant_id, user_id, check_in_at, "api")
        except asyncpg.UniqueViolationError as exc:
            raise AlreadyCheckedInError from exc


async def list_attendance(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_attendance(conn, user_id)
