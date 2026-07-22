"""Telegram Bot API client -- backed by `aiogram`'s `Bot` class (migrated
2026-07-13 from a hand-rolled `urllib` + `asyncio.to_thread` client, for real
async I/O instead of tying up a thread-pool slot per call). Every public
function here keeps its original signature/return shape and raises the same
`TelegramApiError`, so `notifications/tasks.py`/`service.py`
needed zero changes -- this module is purely an HTTP-layer swap, not an
architecture change. A short-lived `Bot` instance is created per call (this
app polls/sends across many tenants' own bot tokens, never one fixed bot), so
its aiohttp session is closed again immediately after -- no shared session to
leak across tenants."""

from collections.abc import Awaitable, Callable
from typing import TypeVar

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import BufferedInputFile

_T = TypeVar("_T")


class TelegramApiError(Exception):
    def __init__(self, error_code: int | None, description: str):
        self.error_code = error_code
        self.description = description
        super().__init__(f"Telegram API error {error_code}: {description}")


async def _with_bot(bot_token: str, fn: Callable[[Bot], Awaitable[_T]]) -> _T:
    bot = Bot(token=bot_token)
    try:
        return await fn(bot)
    except TelegramAPIError as exc:
        # aiogram doesn't surface Telegram's raw numeric error_code on its
        # exception types (it maps description/status into typed subclasses
        # instead) -- nothing in this repo reads .error_code besides this
        # module itself, so None is a safe, harmless placeholder here.
        raise TelegramApiError(None, str(exc)) from exc
    finally:
        await bot.session.close()


async def get_me(bot_token: str) -> dict:
    """Fetches the bot's own username (`getMe`) -- captured once at
    configure_telegram_bot time so the personal-link deep link
    (t.me/<username>?start=<token>) doesn't need a separate manual field."""

    async def _call(bot: Bot) -> dict:
        user = await bot.get_me()
        return {"id": user.id, "username": user.username}

    return await _with_bot(bot_token, _call)


async def get_updates(bot_token: str, offset: int | None) -> list[dict]:
    """Long-poll alternative to a webhook -- Telegram's `setWebhook` requires
    a public HTTPS URL, which this deployment doesn't have yet (see
    CLAUDE.md's Deployment section: no TLS/domain). `timeout=0` here means a
    plain non-blocking poll (the calling worker controls its own poll
    interval) rather than Telegram's own long-poll wait. Returns plain dicts
    (not aiogram's typed Update objects) via model_dump(), matching the exact
    shape notifications/tasks.py already parses (update_id, message.chat.id,
    message.chat.type, message.text) -- that caller needed no changes."""

    async def _call(bot: Bot) -> list[dict]:
        updates = await bot.get_updates(offset=offset, timeout=0)
        return [u.model_dump(mode="json") for u in updates]

    return await _with_bot(bot_token, _call)


async def get_chat(bot_token: str, chat_id: int) -> dict:
    """Live lookup of a group's display title -- used to enrich the group
    list in the UI beyond the raw numeric chat_id/manually-set label."""

    async def _call(bot: Bot) -> dict:
        chat = await bot.get_chat(chat_id)
        return {"title": chat.title}

    return await _with_bot(bot_token, _call)


async def send_message(bot_token: str, chat_id: int, text: str) -> dict:
    async def _call(bot: Bot) -> dict:
        message = await bot.send_message(chat_id, text)
        return {"message_id": message.message_id}

    return await _with_bot(bot_token, _call)


async def send_document(bot_token: str, chat_id: int, filename: str, data: bytes, caption: str | None = None) -> dict:
    async def _call(bot: Bot) -> dict:
        document = BufferedInputFile(data, filename=filename)
        message = await bot.send_document(chat_id, document, caption=caption)
        return {"message_id": message.message_id}

    return await _with_bot(bot_token, _call)
