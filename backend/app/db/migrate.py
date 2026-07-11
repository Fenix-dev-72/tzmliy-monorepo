"""Minimal SQL migration runner.

No Alembic/SQLAlchemy — migrations are plain, reviewable .sql files applied in
filename order, tracked in a schema_migrations table. Run with:

    python -m app.db.migrate
"""

import asyncio
import sys
from pathlib import Path

import asyncpg

from app.core.config import get_settings

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def _ensure_migrations_table(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


async def _applied_versions(conn: asyncpg.Connection) -> set[str]:
    rows = await conn.fetch("SELECT version FROM schema_migrations")
    return {row["version"] for row in rows}


def _render(sql: str, app_db_password: str) -> str:
    escaped = app_db_password.replace("'", "''")
    return sql.replace("{{APP_DB_PASSWORD}}", escaped)


async def run_migrations() -> None:
    settings = get_settings()
    conn = await asyncpg.connect(dsn=settings.migrations_database_url)
    try:
        await _ensure_migrations_table(conn)
        applied = await _applied_versions(conn)

        pending = sorted(
            path for path in MIGRATIONS_DIR.glob("*.sql") if path.name not in applied
        )
        if not pending:
            print("No pending migrations.")
            return

        for path in pending:
            sql = _render(path.read_text(encoding="utf-8"), settings.app_db_password)
            print(f"Applying {path.name} ...")
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES ($1)", path.name
                )
            print(f"Applied {path.name}")
    finally:
        await conn.close()


def main() -> None:
    asyncio.run(run_migrations())


if __name__ == "__main__":
    sys.exit(main())
