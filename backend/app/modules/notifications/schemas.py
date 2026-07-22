from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class TelegramBotConfigure(BaseModel):
    bot_token: str = Field(min_length=10)


class TelegramStatusOut(BaseModel):
    configured: bool
    bot_username: str | None = None


class TelegramLinkTokenOut(BaseModel):
    deep_link: str
    expires_at: datetime


class GroupLinkTokenRequest(BaseModel):
    category_id: UUID | None = None
    label: str = Field(min_length=1)


class ScheduleUpsert(BaseModel):
    label: str = ""
    send_time: time
    # NULL/None = every day; otherwise 0=Mon..6=Sun.
    days_of_week: list[int] | None = None
    is_enabled: bool = True
    # Which already-connected group to target -- None falls back to the
    # tenant's default (no-category) group mapping, same resolution as
    # every other send in this module.
    group_mapping_id: UUID | None = None
    content_type: Literal["leaderboard", "seller_kpis", "custom_text"] = "leaderboard"
    period: Literal["today", "week", "month"] = "today"
    custom_text: str | None = None
    # Which sellers/managers' sales to include -- None means everyone.
    user_ids: list[UUID] | None = None
    # Whole-role targeting -- OR'd with user_ids, not ANDed: a user is
    # included if they're in user_ids OR hold one of these roles.
    role_ids: list[UUID] | None = None

    @model_validator(mode="after")
    def _validate_content(self) -> "ScheduleUpsert":
        if self.content_type == "custom_text" and not self.custom_text:
            raise ValueError("custom_text is required when content_type is 'custom_text'")
        if self.content_type != "custom_text" and self.custom_text:
            raise ValueError("custom_text must be empty unless content_type is 'custom_text'")
        if self.content_type == "seller_kpis":
            targeted = len(self.user_ids or [])
            if targeted != 1 or self.role_ids:
                raise ValueError("content_type 'seller_kpis' requires exactly one targeted user_id and no role_ids")
        return self


class ScheduleOut(BaseModel):
    id: UUID
    tenant_id: UUID
    label: str
    send_time: time
    days_of_week: list[int] | None
    is_enabled: bool
    last_sent_date: date | None
    group_mapping_id: UUID | None
    content_type: str
    period: str
    custom_text: str | None
    user_ids: list[UUID] | None
    role_ids: list[UUID] | None
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime


class GroupMappingCreate(BaseModel):
    category_id: UUID | None = None
    telegram_chat_id: int
    label: str = Field(min_length=1)


class GroupMappingUpdate(BaseModel):
    label: str | None = None
    category_id: UUID | None = None


class GroupMappingOut(BaseModel):
    id: UUID
    tenant_id: UUID
    category_id: UUID | None
    telegram_chat_id: int
    label: str
    is_active: bool
    created_at: datetime
    # Best-effort live Telegram getChat lookup -- None if the bot can no
    # longer reach the chat (e.g. removed from the group) or on any API
    # error; the frontend falls back to the manually-set label in that case.
    resolved_title: str | None = None


class MessageSendRequest(BaseModel):
    category_id: UUID | None = None
    # Explicit target from the admin's own connected-groups list -- takes
    # precedence over category_id when given.
    group_mapping_id: UUID | None = None
    text: str = Field(min_length=1)


class SalesSummaryReportRequest(BaseModel):
    category_id: UUID | None = None
    period_start: datetime
    period_end: datetime


class SellerKpiReportRequest(BaseModel):
    seller_user_id: UUID
    period_start: datetime
    period_end: datetime


class OutboxMessageOut(BaseModel):
    id: UUID
    tenant_id: UUID
    channel: str
    telegram_chat_id: int
    text_body: str | None
    document_object_key: str | None
    document_filename: str | None
    category_id: UUID | None
    status: str
    retry_count: int
    max_retries: int
    next_attempt_at: datetime
    last_error: str | None
    created_by_user_id: UUID | None
    created_at: datetime
    sent_at: datetime | None


class DeliveryLogOut(BaseModel):
    id: UUID
    tenant_id: UUID
    outbox_id: UUID
    attempt_number: int
    status: str
    error: str | None
    attempted_at: datetime
