from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.catalog import repository
from app.modules.catalog.schemas import CategoryNode


class NestedCategoryNotAllowedError(Exception):
    """Raised when a category-create/move tries to set a parent_id at all
    (2026-07-24, client decision: max depth is now Katalog -> Kategoriya,
    a single flat level -- no more "Telefon -> S25 Ultra -> Qora -> 512GB"
    style deep chains, per the original Faza 3 design this module's own
    docstring in CLAUDE.md still describes). parent_id itself is left in
    the schema/DB rather than dropped -- no migration needed since
    production had zero already-nested categories when this landed, and
    keeping the column is a strictly smaller, easier-to-revert change than
    ripping out the adjacency-list shape entirely."""

    pass


class CategoryNotFoundError(Exception):
    pass


class DuplicateNameError(Exception):
    pass


class CategoryHasChildrenError(Exception):
    pass


class CategoryHasProductsError(Exception):
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
    if parent_id is not None:
        raise NestedCategoryNotAllowedError
    async with tenant_connection(pool, tenant_id) as conn:
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
            await repository.update_category(conn, category_id, name)
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
        try:
            await repository.delete_category(conn, category_id)
        except asyncpg.ForeignKeyViolationError as exc:
            raise CategoryHasProductsError from exc
