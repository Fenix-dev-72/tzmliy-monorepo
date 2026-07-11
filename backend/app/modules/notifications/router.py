from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import NOTIFICATIONS_MANAGE, NOTIFICATIONS_VIEW
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    DeliveryLogOut,
    GroupMappingCreate,
    GroupMappingOut,
    MessageSendRequest,
    OutboxMessageOut,
    SalesSummaryReportRequest,
    TelegramBotConfigure,
    TelegramStatusOut,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.post("/integrations/telegram", response_model=TelegramStatusOut, status_code=status.HTTP_201_CREATED)
async def configure_telegram_bot(
    body: TelegramBotConfigure,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    return await service.configure_telegram_bot(pool, auth.tenant_id, body.bot_token)


@router.get("/integrations/telegram", response_model=TelegramStatusOut)
async def get_telegram_status(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW))):
    return await service.get_telegram_status(pool, auth.tenant_id)


@router.post("/group-mappings", response_model=GroupMappingOut, status_code=status.HTTP_201_CREATED)
async def create_group_mapping(
    body: GroupMappingCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    return await service.create_group_mapping(pool, auth.tenant_id, body.category_id, body.telegram_chat_id, body.label)


@router.get("/group-mappings", response_model=list[GroupMappingOut])
async def list_group_mappings(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW))):
    return await service.list_group_mappings(pool, auth.tenant_id)


@router.post("/messages", response_model=OutboxMessageOut, status_code=status.HTTP_201_CREATED)
async def send_group_message(
    body: MessageSendRequest,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_MANAGE)),
):
    try:
        return await service.send_group_message(pool, auth.tenant_id, auth.user_id, body.category_id, body.text)
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


@router.get("/delivery-log", response_model=list[DeliveryLogOut])
async def list_delivery_log(
    outbox_id: UUID | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(NOTIFICATIONS_VIEW)),
):
    return await service.list_delivery_log(pool, auth.tenant_id, outbox_id)
