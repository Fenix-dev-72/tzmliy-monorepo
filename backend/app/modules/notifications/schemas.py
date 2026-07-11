from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TelegramBotConfigure(BaseModel):
    bot_token: str = Field(min_length=10)


class TelegramStatusOut(BaseModel):
    configured: bool


class GroupMappingCreate(BaseModel):
    category_id: UUID | None = None
    telegram_chat_id: int
    label: str = Field(min_length=1)


class GroupMappingOut(BaseModel):
    id: UUID
    tenant_id: UUID
    category_id: UUID | None
    telegram_chat_id: int
    label: str
    is_active: bool
    created_at: datetime


class MessageSendRequest(BaseModel):
    category_id: UUID | None = None
    text: str = Field(min_length=1)


class SalesSummaryReportRequest(BaseModel):
    category_id: UUID | None = None
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
