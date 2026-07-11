from uuid import UUID

import asyncpg

from app.core.database import platform_connection, tenant_connection
from app.core.security import hash_password
from app.modules.auth import repository, roles_repository


class RoleNotInTenantError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class EmailTakenError(Exception):
    pass


class PhoneTakenError(Exception):
    pass


async def create_user(
    pool: asyncpg.Pool, tenant_id: UUID, email: str, password: str, role_id: UUID, phone: str | None = None
) -> dict:
    email = email.strip().lower()
    phone = phone.strip() if phone else None
    password_hash = await hash_password(password)

    if phone:
        # email's own conflict is caught by insert_user_with_identifiers'
        # ON CONFLICT (email) below; phone needs a pre-check since a
        # partial-unique-index violation there would otherwise surface as a
        # raw asyncpg.UniqueViolationError instead of a clean error.
        async with platform_connection(pool) as conn:
            if await repository.get_login_identifier(conn, phone) is not None:
                raise PhoneTakenError

    async with tenant_connection(pool, tenant_id) as conn:
        user = await repository.insert_user_with_identifiers(conn, tenant_id, email, phone, password_hash, role_id)
        if user is None:
            raise EmailTakenError
        return user


async def list_users(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_users(conn)


async def update_user_role(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, role_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_user_by_id(conn, user_id) is None:
            raise UserNotFoundError
        role = await roles_repository.get_role_by_id(conn, role_id)
        if role is None:
            raise RoleNotInTenantError
        await repository.update_user_role(conn, user_id, role_id)


async def deactivate_user(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_user_by_id(conn, user_id) is None:
            raise UserNotFoundError
        await repository.deactivate_user(conn, user_id)
