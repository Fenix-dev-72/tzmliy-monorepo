from datetime import datetime

from pydantic import BaseModel, Field


class BackupBotTokenIn(BaseModel):
    bot_token: str = Field(min_length=1)
    reason: str = Field(min_length=3)


class BackupLinkTokenOut(BaseModel):
    # t.me/<bot>?startgroup=<token> -- Telegram itself prompts the admin to
    # pick a group and delivers the token back as a message inside it, so
    # the chat_id is auto-discovered, never typed in by hand.
    deep_link: str
    expires_at: datetime


class BackupSettingsOut(BaseModel):
    # Never includes the decrypted (or even encrypted) bot token -- this is
    # a status view for the Platform Admin dashboard warning banner, not a
    # credential-read endpoint.
    bot_configured: bool
    bot_username: str | None
    configured: bool  # bot_configured AND a group chat_id has been linked
    chat_id: int | None
    link_pending: bool
    last_backup_at: datetime | None
    last_backup_status: str | None
    last_backup_error: str | None
