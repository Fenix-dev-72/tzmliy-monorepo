from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.auth import roles_repository
from app.modules.auth.permissions import ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS


class UnknownPermissionError(Exception):
    pass


class RoleNameTakenError(Exception):
    pass


class RoleNotFoundError(Exception):
    pass


def _validate_permissions(keys: list[str]) -> None:
    unknown = set(keys) - ALL_PERMISSIONS
    if unknown:
        raise UnknownPermissionError(", ".join(sorted(unknown)))


async def get_role_permission_keys(conn: asyncpg.Connection, role_id: UUID) -> list[str]:
    return await roles_repository.list_role_permission_keys(conn, role_id)


async def seed_default_roles(pool: asyncpg.Pool, tenant_id: UUID) -> dict[str, UUID]:
    """Called once, right after a tenant is created, so a Tenant Admin
    account always has a role to be assigned before any custom roles exist."""
    role_ids: dict[str, UUID] = {}
    async with tenant_connection(pool, tenant_id) as conn:
        for name, perms in DEFAULT_ROLE_PERMISSIONS.items():
            role = await roles_repository.insert_role(conn, tenant_id, name, is_system=True)
            if role is None:
                role = await roles_repository.get_role_by_name(conn, tenant_id, name)
            for perm in perms:
                await roles_repository.insert_role_permission(conn, role["id"], tenant_id, perm)
            role_ids[name] = role["id"]
    return role_ids


async def get_role_by_name(pool: asyncpg.Pool, tenant_id: UUID, name: str) -> dict | None:
    async with tenant_connection(pool, tenant_id) as conn:
        return await roles_repository.get_role_by_name(conn, tenant_id, name)


async def create_role(pool: asyncpg.Pool, tenant_id: UUID, name: str, permission_keys: list[str]) -> dict:
    _validate_permissions(permission_keys)
    async with tenant_connection(pool, tenant_id) as conn:
        role = await roles_repository.insert_role(conn, tenant_id, name, is_system=False)
        if role is None:
            raise RoleNameTakenError
        for perm in permission_keys:
            await roles_repository.insert_role_permission(conn, role["id"], tenant_id, perm)
    return {**role, "permissions": sorted(permission_keys)}


async def list_roles(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        roles = await roles_repository.list_roles(conn)
        if not roles:
            return []
        perms_by_role = await roles_repository.list_role_permission_keys_bulk(conn, [role["id"] for role in roles])
        return [{**role, "permissions": sorted(perms_by_role[role["id"]])} for role in roles]


async def update_role_permissions(pool: asyncpg.Pool, tenant_id: UUID, role_id: UUID, permission_keys: list[str]) -> dict:
    _validate_permissions(permission_keys)
    async with tenant_connection(pool, tenant_id) as conn:
        role = await roles_repository.get_role_by_id(conn, role_id)
        if role is None:
            raise RoleNotFoundError
        await roles_repository.delete_role_permissions(conn, role_id)
        for perm in permission_keys:
            await roles_repository.insert_role_permission(conn, role_id, tenant_id, perm)
    return {**role, "permissions": sorted(permission_keys)}
