import secrets
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg

from app.core import storage
from app.core.config import Settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import platform_connection, tenant_connection
from app.core.security import hash_token
from app.modules.analytics import service as analytics_service
from app.modules.auth import repository as auth_repository
from app.modules.calls import repository as calls_repository
from app.modules.notifications import reports, repository, telegram
from app.modules.tenants import repository as tenants_repository

TELEGRAM_PROVIDER = "telegram"

# Fixed Asia/Tashkent offset (UTC+5) -- same constant as analytics/service.py,
# so "today"/"send_time" both mean the same wall-clock day for the tenant.
_TASHKENT_TZ = timezone(timedelta(hours=5))


class GroupMappingNotFoundError(Exception):
    pass


class InvalidPeriodError(Exception):
    pass


class TelegramNotConfiguredError(Exception):
    pass


class InvalidOrExpiredLinkTokenError(Exception):
    pass


class GroupMappingCategoryTakenError(Exception):
    pass


class GroupMappingInUseError(Exception):
    def __init__(self, blocking_schedules: list[dict]):
        self.blocking_schedules = blocking_schedules
        super().__init__("Group mapping is referenced by one or more notification schedules")


class ScheduleNotFoundError(Exception):
    pass


class SellerNotFoundError(Exception):
    pass


async def configure_telegram_bot(pool: asyncpg.Pool, tenant_id: UUID, bot_token: str) -> dict:
    # Capture the bot's own @username once here (Telegram's getMe) so the
    # personal-link deep link (t.me/<username>?start=<token>) doesn't need a
    # separate manual "bot username" field -- reuses integration_credentials'
    # existing external_account_id column, same as AmoCRM's subdomain/Meta's
    # ad account id.
    bot_info = await telegram.get_me(bot_token)
    async with tenant_connection(pool, tenant_id) as conn:
        await calls_repository.upsert_integration_credential_with_account(
            conn, tenant_id, TELEGRAM_PROVIDER, encrypt_secret(bot_token), None, bot_info.get("username")
        )
    return {"configured": True}


async def create_telegram_link_token(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, settings: Settings
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await calls_repository.get_active_integration_credential_with_account(conn, TELEGRAM_PROVIDER)
        if credential is None or not credential["external_account_id"]:
            raise TelegramNotConfiguredError
        token = secrets.token_urlsafe(24)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.telegram_link_token_ttl_minutes)
        await auth_repository.set_telegram_link_token(conn, user_id, hash_token(token), expires_at)
    return {
        "deep_link": f"https://t.me/{credential['external_account_id']}?start={token}",
        "expires_at": expires_at,
    }


async def resolve_telegram_link(pool: asyncpg.Pool, tenant_id: UUID, token: str, chat_id: int) -> bool:
    """Called by notifications/tasks.py's poll_tenant_group_links_task for each `/start <token>` message it
    polls up. Returns False (no-op, not an error) for an unknown/expired/
    already-used token -- a stale or replayed /start shouldn't crash the
    worker or affect other tenants' polling."""
    async with tenant_connection(pool, tenant_id) as conn:
        user = await auth_repository.get_user_by_telegram_link_token(conn, tenant_id, hash_token(token))
        if user is None:
            return False
        if user["telegram_link_token_expires_at"] < datetime.now(timezone.utc):
            return False
        await auth_repository.set_telegram_chat_id(conn, user["id"], chat_id)
        return True


async def create_group_link_token(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, category_id: UUID | None, label: str, settings: Settings
) -> dict:
    """Telegram's own `?startgroup=<token>` deep link prompts the user to
    pick a group to add the bot to, then delivers this same token back as a
    `/start <token>` message *inside* that group -- so the chat_id never
    needs to be typed in by hand (Telegram's UI never shows it at all)."""
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await calls_repository.get_active_integration_credential_with_account(conn, TELEGRAM_PROVIDER)
        if credential is None or not credential["external_account_id"]:
            raise TelegramNotConfiguredError
        token = secrets.token_urlsafe(24)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.telegram_link_token_ttl_minutes)
        await repository.insert_group_link_request(conn, tenant_id, hash_token(token), category_id, label, user_id, expires_at)
    return {
        "deep_link": f"https://t.me/{credential['external_account_id']}?startgroup={token}",
        "expires_at": expires_at,
    }


async def resolve_telegram_group_link(pool: asyncpg.Pool, tenant_id: UUID, token: str, chat_id: int) -> bool:
    """Called by notifications/tasks.py's poll_tenant_group_links_task for a `/start <token>` message
    arriving from a group/supergroup chat (as opposed to a private chat,
    which is the personal-link case handled by resolve_telegram_link).
    Same no-op-on-stale-token contract as resolve_telegram_link."""
    async with tenant_connection(pool, tenant_id) as conn:
        request = await repository.get_group_link_request_by_token(conn, tenant_id, hash_token(token))
        if request is None:
            return False
        if request["expires_at"] < datetime.now(timezone.utc):
            await repository.delete_group_link_request(conn, request["id"])
            return False
        if request["category_id"] is None:
            await repository.upsert_default_group_mapping(conn, tenant_id, chat_id, request["label"])
        else:
            await repository.upsert_group_mapping_for_category(conn, tenant_id, request["category_id"], chat_id, request["label"])
        await repository.delete_group_link_request(conn, request["id"])
        return True


async def get_telegram_status(pool: asyncpg.Pool, tenant_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await calls_repository.get_active_integration_credential_with_account(conn, TELEGRAM_PROVIDER)
    return {
        "configured": credential is not None,
        "bot_username": credential["external_account_id"] if credential else None,
    }


async def disconnect_telegram_bot(pool: asyncpg.Pool, tenant_id: UUID) -> dict:
    """Only one bot per tenant can ever exist (UNIQUE(tenant_id, provider) on
    integration_credentials) -- configuring a new token always overwrites the
    old one (see configure_telegram_bot's upsert), so "change" is already
    just re-running that. This is the other half: "disconnect" with no
    replacement, deactivating the row so get_active_integration_credential
    stops finding it (personal/group linking and delivery all no-op until
    reconfigured)."""
    async with tenant_connection(pool, tenant_id) as conn:
        await calls_repository.deactivate_integration_credential(conn, TELEGRAM_PROVIDER)
    return {"configured": False}


async def create_group_mapping(
    pool: asyncpg.Pool, tenant_id: UUID, category_id: UUID | None, telegram_chat_id: int, label: str
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if category_id is None:
            return await repository.upsert_default_group_mapping(conn, tenant_id, telegram_chat_id, label)
        return await repository.upsert_group_mapping_for_category(conn, tenant_id, category_id, telegram_chat_id, label)


async def list_group_mappings(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        mappings = await repository.list_group_mappings(conn)
        credential = await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER)

    if credential is None:
        for mapping in mappings:
            mapping["resolved_title"] = None
        return mappings

    bot_token = decrypt_secret(credential["webhook_secret_encrypted"])
    for mapping in mappings:
        try:
            chat = await telegram.get_chat(bot_token, mapping["telegram_chat_id"])
            mapping["resolved_title"] = chat.get("title")
        except telegram.TelegramApiError:
            mapping["resolved_title"] = None
    return mappings


_UNSET = object()


async def update_group_mapping(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    mapping_id: UUID,
    label: str | None = _UNSET,  # type: ignore[assignment]
    category_id: UUID | None = _UNSET,  # type: ignore[assignment]
) -> dict:
    """Same _UNSET-sentinel shape as users_service.update_user_profile --
    category_id = None is a legitimate value (moves this mapping to be the
    tenant's default group), so a plain None default can't distinguish
    "leave unchanged" from "clear it"."""
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_group_mapping_by_id(conn, mapping_id)
        if existing is None:
            raise GroupMappingNotFoundError

        resolved_label = existing["label"] if label is _UNSET else label
        resolved_category_id = existing["category_id"] if category_id is _UNSET else category_id

        try:
            return await repository.update_group_mapping(conn, mapping_id, resolved_label, resolved_category_id)
        except asyncpg.UniqueViolationError:
            raise GroupMappingCategoryTakenError


async def deactivate_group_mapping(pool: asyncpg.Pool, tenant_id: UUID, mapping_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_group_mapping_by_id(conn, mapping_id) is None:
            raise GroupMappingNotFoundError
        await repository.deactivate_group_mapping(conn, mapping_id)


async def delete_group_mapping(pool: asyncpg.Pool, tenant_id: UUID, mapping_id: UUID) -> None:
    """Real hard delete, in addition to deactivate above -- fetch-then-check
    so an in-use group (referenced by a schedule) surfaces as a clean 409
    listing the blocking schedules, not a raw FK-violation 500 (the FK on
    notification_schedules.group_mapping_id has no ON DELETE clause, so
    Postgres would otherwise reject this at the DB level with no useful
    detail for the frontend)."""
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_group_mapping_by_id(conn, mapping_id) is None:
            raise GroupMappingNotFoundError
        blocking = await repository.list_schedules_for_group_mapping(conn, mapping_id)
        if blocking:
            raise GroupMappingInUseError(blocking)
        await repository.delete_group_mapping(conn, mapping_id)


async def _resolve_chat_id(
    conn: asyncpg.Connection, category_id: UUID | None, group_mapping_id: UUID | None = None
) -> int:
    # An explicit group_mapping_id (the admin picking one of their own
    # already-connected groups) always wins over category-based resolution.
    if group_mapping_id is not None:
        mapping = await repository.get_group_mapping_by_id(conn, group_mapping_id)
        if mapping is None:
            raise GroupMappingNotFoundError
        return mapping["telegram_chat_id"]
    mapping = None
    if category_id is not None:
        mapping = await repository.get_group_mapping_by_category(conn, category_id)
    if mapping is None:
        mapping = await repository.get_default_group_mapping(conn)
    if mapping is None:
        raise GroupMappingNotFoundError
    return mapping["telegram_chat_id"]


async def send_group_message(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, category_id: UUID | None, text: str, group_mapping_id: UUID | None = None
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER) is None:
            raise TelegramNotConfiguredError
        chat_id = await _resolve_chat_id(conn, category_id, group_mapping_id)
        return await repository.enqueue_message(conn, tenant_id, chat_id, text, category_id, user_id)


async def send_sales_summary_report(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    user_id: UUID,
    category_id: UUID | None,
    period_start: datetime,
    period_end: datetime,
) -> dict:
    if period_end <= period_start:
        raise InvalidPeriodError

    async with platform_connection(pool) as conn:
        tenant = await tenants_repository.get_tenant_by_id(conn, tenant_id)
    tenant_name = tenant["name"] if tenant is not None else str(tenant_id)

    async with tenant_connection(pool, tenant_id) as conn:
        if await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER) is None:
            raise TelegramNotConfiguredError
        chat_id = await _resolve_chat_id(conn, category_id)
        rows = await repository.get_sales_summary_rows(conn, period_start, period_end, category_id)

        pdf_bytes = reports.render_sales_summary_pdf(tenant_name, period_start, period_end, rows)
        object_key = f"reports/{tenant_id}/{uuid4()}.pdf"
        await storage.put_object(object_key, pdf_bytes, content_type="application/pdf")
        filename = f"sales-summary-{period_start:%Y%m%d}-{period_end:%Y%m%d}.pdf"

        return await repository.enqueue_document(conn, tenant_id, chat_id, object_key, filename, category_id, user_id)


async def send_seller_kpi_report(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, seller_user_id: UUID, period_start: datetime, period_end: datetime
) -> dict:
    """"PDF ni adminlarga yuborish" on the seller KPI dashboard -- identical
    control flow to send_sales_summary_report (render -> object storage ->
    enqueue_document), just a different data source/renderer. Sent to the
    tenant's default Telegram group (_resolve_chat_id with no category_id) --
    there's no separate "admin-only" Telegram audience concept anywhere else
    in this module to invent one just for this button."""
    if period_end <= period_start:
        raise InvalidPeriodError

    async with platform_connection(pool) as conn:
        tenant = await tenants_repository.get_tenant_by_id(conn, tenant_id)
    tenant_name = tenant["name"] if tenant is not None else str(tenant_id)

    async with tenant_connection(pool, tenant_id) as conn:
        seller = await auth_repository.get_user_by_id(conn, seller_user_id)
    if seller is None:
        raise SellerNotFoundError
    seller_name = seller.get("full_name") or seller.get("email") or seller.get("phone") or str(seller_user_id)

    kpis = await analytics_service.get_seller_kpis(pool, tenant_id, seller_user_id, period_start, period_end)

    async with tenant_connection(pool, tenant_id) as conn:
        if await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER) is None:
            raise TelegramNotConfiguredError
        chat_id = await _resolve_chat_id(conn, None)

        pdf_bytes = reports.render_seller_kpi_pdf(tenant_name, seller_name, period_start, period_end, kpis)
        object_key = f"reports/{tenant_id}/{uuid4()}.pdf"
        await storage.put_object(object_key, pdf_bytes, content_type="application/pdf")
        filename = f"seller-kpi-{seller_user_id}-{period_start:%Y%m%d}-{period_end:%Y%m%d}.pdf"

        return await repository.enqueue_document(conn, tenant_id, chat_id, object_key, filename, None, user_id)


async def create_schedule(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, data: dict) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.insert_schedule(
            conn,
            tenant_id,
            data["label"],
            data["send_time"],
            data["days_of_week"],
            data["is_enabled"],
            data["group_mapping_id"],
            data["content_type"],
            data["period"],
            data["custom_text"],
            data["user_ids"],
            data["role_ids"],
            user_id,
        )


async def update_schedule(pool: asyncpg.Pool, tenant_id: UUID, schedule_id: UUID, data: dict) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_schedule_by_id(conn, schedule_id) is None:
            raise ScheduleNotFoundError
        return await repository.update_schedule(
            conn,
            schedule_id,
            data["label"],
            data["send_time"],
            data["days_of_week"],
            data["is_enabled"],
            data["group_mapping_id"],
            data["content_type"],
            data["period"],
            data["custom_text"],
            data["user_ids"],
            data["role_ids"],
        )


async def list_schedules(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_schedules(conn)


async def delete_schedule(pool: asyncpg.Pool, tenant_id: UUID, schedule_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_schedule_by_id(conn, schedule_id) is None:
            raise ScheduleNotFoundError
        await repository.delete_schedule(conn, schedule_id)


def _period_bounds(period: str, now_tashkent: datetime) -> tuple[datetime, datetime]:
    today = now_tashkent.date()
    if period == "today":
        start_date = today
    elif period == "week":
        start_date = today - timedelta(days=today.weekday())
    else:  # "month"
        start_date = today.replace(day=1)
    start = datetime.combine(start_date, time.min, tzinfo=_TASHKENT_TZ)
    return start, now_tashkent


def _format_leaderboard(tenant_today: date, leaderboard: list[dict]) -> str:
    lines = [f"\U0001f4ca Savdo hisobot -- {tenant_today:%d.%m.%Y}"]
    if not leaderboard:
        lines.append("Hali savdo bo'lmagan.")
        return "\n".join(lines)
    # One line per (seller, currency) -- money is per-currency and never
    # summed across UZS/USD, same convention as everywhere else in this repo.
    by_user: dict[str, list[dict]] = {}
    for entry in leaderboard:
        by_user.setdefault(entry["user_email"], []).append(entry)
    for email, entries in by_user.items():
        parts = [f"{e['sales_count']} ta savdo, {e['total_amount']:,} {e['currency']}".replace(",", " ") for e in entries]
        lines.append(f"- {email}: {'; '.join(parts)}")
    return "\n".join(lines)


def _format_seller_kpis(tenant_today: date, kpis: dict) -> str:
    lines = [f"\U0001f4c8 Sotuvchi hisoboti -- {tenant_today:%d.%m.%Y}"]
    lines.append(f"Savdolar soni: {kpis['sales_count']}")
    lines.append(f"Konversiya: {kpis['conversion_pct']}%" if kpis["conversion_pct"] is not None else "Konversiya: -")
    if kpis["sales_total_uzs"]:
        lines.append(f"Jami (UZS): {kpis['sales_total_uzs']:,}".replace(",", " "))
    if kpis["sales_total_usd"]:
        lines.append(f"Jami (USD): {kpis['sales_total_usd']:,}".replace(",", " "))
    if kpis["refund_pct"] is not None:
        lines.append(f"Qaytarish: {kpis['refund_pct']}%")
    return "\n".join(lines)


async def _build_message_body(pool: asyncpg.Pool, tenant_id: UUID, schedule: dict, now_tashkent: datetime) -> str:
    if schedule["content_type"] == "custom_text":
        return schedule["custom_text"]

    period_start, period_end = _period_bounds(schedule["period"], now_tashkent)
    today = now_tashkent.date()

    if schedule["content_type"] == "seller_kpis":
        user_id = UUID(str(schedule["user_ids"][0]))
        kpis = await analytics_service.get_seller_kpis(pool, tenant_id, user_id, period_start, period_end)
        return _format_seller_kpis(today, kpis)

    # Scheduled tenant-wide report (Telegram bot delivery, not a live tenant
    # user session) -- always the full leaderboard, own-data scoping doesn't
    # apply here.
    leaderboard = await analytics_service.get_leaderboard(
        pool, tenant_id, period_start, period_end, tenant_id, True
    )
    allowed = {str(uid) for uid in (schedule["user_ids"] or [])}
    if schedule["role_ids"]:
        async with tenant_connection(pool, tenant_id) as conn:
            role_users = await repository.get_user_ids_by_roles(conn, schedule["role_ids"])
        allowed |= {str(row["id"]) for row in role_users}
    if allowed:
        leaderboard = [entry for entry in leaderboard if str(entry["user_id"]) in allowed]
    return _format_leaderboard(today, leaderboard)


def is_schedule_due(schedule: dict, now_tashkent: datetime) -> bool:
    today = now_tashkent.date()
    if not schedule["is_enabled"]:
        return False
    if schedule["last_sent_date"] == today:
        return False
    if now_tashkent.time() < schedule["send_time"]:
        return False
    days = schedule["days_of_week"]
    if days and now_tashkent.weekday() not in days:
        return False
    return True


async def run_schedule_if_due(pool: asyncpg.Pool, tenant_id: UUID, schedule_id: UUID) -> dict | None:
    """Called by the Celery `notifications.run_schedule` task (dispatched by
    `notifications.dispatch_due_schedules`, a beat-driven fan-out, once per
    enabled schedule per tenant). Re-checks due-ness itself (the dispatch
    task's own check can be slightly stale by the time this runs) before
    doing any work, then enqueues onto the same notification_outbox every
    other send in this module uses -- delivery (retry/backoff/dead-letter) is
    handled by the existing outbox pipeline, not duplicated here."""
    now_tashkent = datetime.now(_TASHKENT_TZ)

    async with tenant_connection(pool, tenant_id) as conn:
        schedule = await repository.get_schedule_by_id(conn, schedule_id)
        if schedule is None or not is_schedule_due(schedule, now_tashkent):
            return
        if await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER) is None:
            return
        try:
            chat_id = await _resolve_chat_id(conn, None, schedule["group_mapping_id"])
        except GroupMappingNotFoundError:
            return

    # Building the message body may open its own tenant_connection(s) (e.g.
    # analytics_service.get_leaderboard) -- done outside the block above so
    # this doesn't hold two pool connections open at once.
    text = await _build_message_body(pool, tenant_id, schedule, now_tashkent)

    async with tenant_connection(pool, tenant_id) as conn:
        message = await repository.enqueue_message(conn, tenant_id, chat_id, text, None, schedule["created_by_user_id"])
        await repository.mark_schedule_sent(conn, schedule_id, now_tashkent.date())
    return message


async def list_outbox(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_outbox_for_tenant(conn)


async def list_delivery_log(pool: asyncpg.Pool, tenant_id: UUID, outbox_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_delivery_log(conn, outbox_id)
