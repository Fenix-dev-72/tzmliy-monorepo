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


class CannotAssignAdminRoleError(Exception):
    pass


def _reject_system_admin_role(role: dict | None) -> None:
    """A tenant's system 'admin' role is the owner seeded at tenant creation
    (roles_service.seed_default_roles) -- employees created/promoted from the
    Users page must never be handed that role, so both write paths below
    check it explicitly rather than relying on the frontend's own role-picker
    filter (which is UI-only and doesn't stop a direct API call)."""
    if role is not None and role["is_system"] and role["name"] == "admin":
        raise CannotAssignAdminRoleError


async def create_user(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    email: str,
    password: str,
    role_id: UUID,
    phone: str | None = None,
    allow_admin_role: bool = False,
) -> dict:
    """allow_admin_role (2026-07-22 bug fix): only tenants/service.py's
    create_tenant_admin_user (Platform Admin bootstrapping a brand-new
    tenant's first user) may pass True -- that's the one legitimate caller
    that must be able to hand out the system 'admin' role. Every other
    caller (the Users-page create-employee flow) keeps the default False, so
    _reject_system_admin_role's guard still applies to them. Before this fix,
    create_tenant_admin_user reused this same function and always hit that
    guard, so bootstrapping a tenant's first admin user always 500'd
    (CannotAssignAdminRoleError was never caught by the router either)."""
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
        role = await roles_repository.get_role_by_id(conn, role_id)
        if role is None:
            raise RoleNotInTenantError
        if not allow_admin_role:
            _reject_system_admin_role(role)
        user = await repository.insert_user_with_identifiers(conn, tenant_id, email, phone, password_hash, role_id)
        if user is None:
            raise EmailTakenError
        return user


async def list_users(pool: asyncpg.Pool, tenant_id: UUID, limit: int = 20, offset: int = 0) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_users(conn, limit, offset)


async def update_user_role(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, role_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_user_by_id(conn, user_id) is None:
            raise UserNotFoundError
        role = await roles_repository.get_role_by_id(conn, role_id)
        if role is None:
            raise RoleNotInTenantError
        _reject_system_admin_role(role)
        await repository.update_user_role(conn, user_id, role_id)


async def deactivate_user(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_user_by_id(conn, user_id) is None:
            raise UserNotFoundError
        await repository.deactivate_user(conn, user_id)


_UNSET = object()


async def update_user_profile(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    user_id: UUID,
    full_name: str | None = _UNSET,  # type: ignore[assignment]
    phone: str | None = _UNSET,  # type: ignore[assignment]
) -> dict:
    """Shared by both the self (`/users/me/profile`) and admin
    (`/users/{id}/profile`) routes -- authorization is enforced by which
    router dependency called this, not by this function.

    A field left as `_UNSET` (the router only passes fields present in the
    PATCH body, via `model_dump(exclude_unset=True)`) means "leave
    unchanged" -- a plain `None` default here would make a PATCH that only
    sends `full_name` silently null out `phone`, since Pydantic can't
    otherwise distinguish "field omitted" from "field explicitly cleared"."""
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_user_by_id(conn, user_id)
        if existing is None:
            raise UserNotFoundError

        if full_name is _UNSET:
            full_name = existing["full_name"]
        else:
            full_name = full_name.strip() if full_name else None
        if phone is _UNSET:
            phone = existing["phone"]
        else:
            phone = phone.strip() if phone else None

        phone_changed = phone != existing["phone"]

    if phone_changed and phone:
        # Same pre-check shape as create_user -- phone is globally unique, so
        # a raw UPDATE could otherwise surface as an unhandled
        # asyncpg.UniqueViolationError. Done as a separate connection (not
        # nested inside the tenant_connection above) -- platform_connection
        # opens its own pool connection, and this repo's convention (see
        # calls/service.py's ingest_webhook) is sequential connections, not
        # nested acquires from the same pool.
        async with platform_connection(pool) as platform_conn:
            identifier = await repository.get_login_identifier(platform_conn, phone)
            if identifier is not None and identifier["user_id"] != user_id:
                raise PhoneTakenError

    async with tenant_connection(pool, tenant_id) as conn:
        updated = await repository.update_user_profile(conn, user_id, full_name, phone)
        if phone_changed:
            # Keep user_login_identifiers in sync -- every path that changes
            # a user's phone must do this or identifier-based login silently
            # breaks for that user (same rule as insert_user_with_identifiers).
            await repository.delete_login_identifier_by_user_and_type(conn, user_id, "phone")
            if phone:
                await repository.insert_login_identifier(conn, phone, "phone", tenant_id, user_id)
        return updated
