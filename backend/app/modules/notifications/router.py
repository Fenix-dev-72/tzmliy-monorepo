from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.deps import AuthContext, get_current_user, get_pool, require_permission
from app.modules.auth.permissions import NOTIFICATIONS_MANAGE, NOTIFICATIONS_VIEW
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    DeliveryLogOut,
    GroupLinkTokenRequest,
    GroupMappingCreate,
    GroupMappingOut,
    GroupMappingUpdate,
    MessageSendRequest,
    OutboxMessageOut,
    SalesSummaryReportRequest,
    SellerKpiReportRequest,
    ScheduleOut,
    ScheduleUpsert,
    TelegramBotConfigure,
    TelegramLinkTokenOut,
    TelegramStatusOut,
)
from app.modules.notifications.telegram import TelegramApiError

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.post("/integrations/telegram", response_model=TelegramStatusOut, status_code=status.HTTP_201_CREATED)
async def configure_telegram_bot(
    body: TelegramBotConfigure,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.configure_telegram_bot(pool, auth.tenant_id, body.bot_token)
    except TelegramApiError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid Telegram bot token: {exc.description}")


@router.get("/integrations/telegram", response_model=TelegramStatusOut)
async def get_telegram_status(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW))):
    return await service.get_telegram_status(pool, auth.tenant_id)


@router.delete("/integrations/telegram", response_model=TelegramStatusOut)
async def disconnect_telegram_bot(
    pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE))
):
    """Only one bot per tenant can ever exist -- "change" is just calling
    configure_telegram_bot again (upsert overwrites), this is "remove with no
    replacement"."""
    return await service.disconnect_telegram_bot(pool, auth.tenant_id)


@router.post("/telegram/link-token", response_model=TelegramLinkTokenOut, status_code=status.HTTP_201_CREATED)
async def create_telegram_link_token(
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    auth: AuthContext = Depends(get_current_user),
):
    """Self-service: no permission needed beyond being logged in -- every
    employee generates their own personal Telegram deep link (client
    requirement, 2026-07-11: each employee's own report should reach them
    individually via Telegram, not just a shared group)."""
    try:
        return await service.create_telegram_link_token(pool, auth.tenant_id, auth.user_id, settings)
    except service.TelegramNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram bot is not configured for this tenant yet")


@router.post("/group-mappings", response_model=GroupMappingOut, status_code=status.HTTP_201_CREATED)
async def create_group_mapping(
    body: GroupMappingCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    return await service.create_group_mapping(pool, auth.tenant_id, body.category_id, body.telegram_chat_id, body.label)


@router.post("/group-mappings/link-token", response_model=TelegramLinkTokenOut, status_code=status.HTTP_201_CREATED)
async def create_group_link_token(
    body: GroupLinkTokenRequest,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    """"Guruhga qo'shish" button -- returns a t.me/<bot>?startgroup=<token>
    deep link. Telegram itself prompts the admin to pick a group to add the
    bot to and delivers the token back as a message inside that group, so
    the chat_id is auto-discovered (never typed in by hand)."""
    try:
        return await service.create_group_link_token(pool, auth.tenant_id, auth.user_id, body.category_id, body.label, settings)
    except service.TelegramNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram bot is not configured for this tenant yet")


@router.get("/group-mappings", response_model=list[GroupMappingOut])
async def list_group_mappings(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW))):
    return await service.list_group_mappings(pool, auth.tenant_id)


@router.patch("/group-mappings/{mapping_id}", response_model=GroupMappingOut)
async def update_group_mapping(
    mapping_id: UUID,
    body: GroupMappingUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.update_group_mapping(
            pool, auth.tenant_id, mapping_id, **body.model_dump(exclude_unset=True)
        )
    except service.GroupMappingNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group mapping not found")
    except service.GroupMappingCategoryTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another active group is already mapped to this category")


@router.patch("/group-mappings/{mapping_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_group_mapping(
    mapping_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE))
):
    try:
        await service.deactivate_group_mapping(pool, auth.tenant_id, mapping_id)
    except service.GroupMappingNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group mapping not found")


@router.delete("/group-mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group_mapping(
    mapping_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE))
):
    """Real hard delete, in addition to /deactivate above. Rejects with 409
    (listing the blocking schedules) if a notification_schedules row still
    references this group -- reassign or delete those first."""
    try:
        await service.delete_group_mapping(pool, auth.tenant_id, mapping_id)
    except service.GroupMappingNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group mapping not found")
    except service.GroupMappingInUseError as exc:
        labels = ", ".join(row["label"] or str(row["id"]) for row in exc.blocking_schedules)
        raise HTTPException(status.HTTP_409_CONFLICT, f"Group is used by schedule(s): {labels}")


@router.post("/messages", response_model=OutboxMessageOut, status_code=status.HTTP_201_CREATED)
async def send_group_message(
    body: MessageSendRequest,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.send_group_message(
            pool, auth.tenant_id, auth.user_id, body.category_id, body.text, body.group_mapping_id
        )
    except service.TelegramNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram bot is not configured for this tenant")
    except service.GroupMappingNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Telegram group mapping found for this category (or default)")


@router.get("/messages", response_model=list[OutboxMessageOut])
async def list_outbox(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW))):
    return await service.list_outbox(pool, auth.tenant_id)


@router.post("/reports/sales-summary", response_model=OutboxMessageOut, status_code=status.HTTP_201_CREATED)
async def send_sales_summary_report(
    body: SalesSummaryReportRequest,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.send_sales_summary_report(
            pool, auth.tenant_id, auth.user_id, body.category_id, body.period_start, body.period_end
        )
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    except service.TelegramNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram bot is not configured for this tenant")
    except service.GroupMappingNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Telegram group mapping found for this category (or default)")


@router.post("/reports/seller-kpi", response_model=OutboxMessageOut, status_code=status.HTTP_201_CREATED)
async def send_seller_kpi_report(
    body: SellerKpiReportRequest,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.send_seller_kpi_report(
            pool, auth.tenant_id, auth.user_id, body.seller_user_id, body.period_start, body.period_end
        )
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    except service.SellerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seller not found in this tenant")
    except service.TelegramNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Telegram bot is not configured for this tenant")
    except service.GroupMappingNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Telegram group mapping found for the tenant default")


@router.post("/schedules", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleUpsert,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    """A tenant can run several independent recurring sends -- each with its
    own group, time, day-of-week filter, targeting, and message content
    (auto-generated team leaderboard, a single seller's KPI digest, or fixed
    text). Dispatched by the Celery beat-driven
    notifications.dispatch_due_schedules task, not an in-process poll loop."""
    return await service.create_schedule(pool, auth.tenant_id, auth.user_id, body.model_dump())


@router.get("/schedules", response_model=list[ScheduleOut])
async def list_schedules(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW))):
    return await service.list_schedules(pool, auth.tenant_id)


@router.patch("/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: UUID,
    body: ScheduleUpsert,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.update_schedule(pool, auth.tenant_id, schedule_id, body.model_dump())
    except service.ScheduleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE))
):
    try:
        await service.delete_schedule(pool, auth.tenant_id, schedule_id)
    except service.ScheduleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")


@router.get("/delivery-log", response_model=list[DeliveryLogOut])
async def list_delivery_log(
    outbox_id: UUID | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW)),
):
    return await service.list_delivery_log(pool, auth.tenant_id, outbox_id)
