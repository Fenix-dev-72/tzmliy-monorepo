"""Create the first platform admin. No login exists yet to do this via the
API, so it's bootstrapped directly against the DB. Idempotent — re-running
with the same email is a no-op if that admin already exists.

    python -m app.db.seed_platform_admin --email admin@dashboarduz.uz --password '...'
"""

import argparse
import asyncio

import asyncpg

from app.core.config import get_settings
from app.core.security import hash_password


async def seed(email: str, password: str) -> None:
    email = email.strip().lower()
    settings = get_settings()
    conn = await asyncpg.connect(dsn=settings.migrations_database_url)
    try:
        existing = await conn.fetchrow("SELECT id FROM platform_admins WHERE email = $1", email)
        if existing is not None:
            print(f"Platform admin {email} already exists, skipping.")
            return
        await conn.execute(
            "INSERT INTO platform_admins (email, password_hash) VALUES ($1, $2)",
            email,
            await hash_password(password),
        )
        print(f"Created platform admin {email}.")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    asyncio.run(seed(args.email, args.password))


if __name__ == "__main__":
    main()
