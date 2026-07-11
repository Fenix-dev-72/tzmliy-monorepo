from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.catalog import repository
from app.modules.catalog.schemas import CategoryNode


class ParentNotFoundError(Exception):
    pass


class CategoryNotFoundError(Exception):
    pass


class DuplicateNameError(Exception):
    pass


class CategoryHasChildrenError(Exception):
    pass


def _build_tree(rows: list[dict]) -> list[CategoryNode]:
    nodes = {row["id"]: CategoryNode(**row) for row in rows}
    roots: list[CategoryNode] = []
    for row in rows:
        node = nodes[row["id"]]
        parent = nodes.get(row["parent_id"]) if row["parent_id"] is not None else None
        (parent.children if parent is not None else roots).append(node)
    return roots


async def create_category(pool: asyncpg.Pool, tenant_id: UUID, name: str, parent_id: UUID | None) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if parent_id is not None and await repository.get_category_by_id(conn, parent_id) is None:
            raise ParentNotFoundError
        try:
            return await repository.insert_category(conn, tenant_id, parent_id, name)
        except asyncpg.UniqueViolationError as exc:
            raise DuplicateNameError from exc


async def list_categories_tree(pool: asyncpg.Pool, tenant_id: UUID) -> list[CategoryNode]:
    async with tenant_connection(pool, tenant_id) as conn:
        rows = await repository.list_categories(conn)
    return _build_tree(rows)


async def update_category(pool: asyncpg.Pool, tenant_id: UUID, category_id: UUID, name: str) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        category = await repository.get_category_by_id(conn, category_id)
        if category is None:
            raise CategoryNotFoundError
        try:
            await repository.update_category_name(conn, category_id, name)
        except asyncpg.UniqueViolationError as exc:
            raise DuplicateNameError from exc
        return {**category, "name": name}


async def delete_category(pool: asyncpg.Pool, tenant_id: UUID, category_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        category = await repository.get_category_by_id(conn, category_id)
        if category is None:
            raise CategoryNotFoundError
        if await repository.count_children(conn, category_id) > 0:
            raise CategoryHasChildrenError
        await repository.delete_category(conn, category_id)
