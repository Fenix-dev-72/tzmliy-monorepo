from datetime import datetime
from pathlib import Path

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def get_backup_settings(conn: asyncpg.Connection) -> dict | None:
    row = await _queries.get_backup_settings(conn)
    return _row(row)


async def upsert_bot_token(conn: asyncpg.Connection, bot_token_encrypted: str, bot_username: str | None) -> dict:
    row = await _queries.upsert_bot_token(conn, bot_token_encrypted=bot_token_encrypted, bot_username=bot_username)
    return _row(row)


async def set_link_token(conn: asyncpg.Connection, token_hash: str, expires_at: datetime) -> None:
    await _queries.set_link_token(conn, token_hash=token_hash, expires_at=expires_at)


async def resolve_link_token(conn: asyncpg.Connection, token_hash: str, chat_id: int) -> bool:
    row = await _queries.resolve_link_token(conn, token_hash=token_hash, chat_id=chat_id)
    return row is not None


async def record_backup_result(conn: asyncpg.Connection, status: str, error: str | None) -> None:
    await _queries.record_backup_result(conn, status=status, error=error)
