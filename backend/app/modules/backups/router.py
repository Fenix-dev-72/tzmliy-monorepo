from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.deps import PlatformAuthContext, get_current_platform_admin, get_pool
from app.modules.tenants.service import TwoFactorRequiredError

from . import service, tasks
from .schemas import BackupBotTokenIn, BackupLinkTokenOut, BackupSettingsOut

router = APIRouter(prefix="/platform/v1/backup-settings", tags=["platform"])


@router.get("", response_model=BackupSettingsOut)
async def get_backup_settings(
    pool=Depends(get_pool), _admin: PlatformAuthContext = Depends(get_current_platform_admin)
):
    return await service.get_status(pool)


@router.put("/bot-token", response_model=BackupSettingsOut)
async def update_bot_token(
    body: BackupBotTokenIn,
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.update_bot_token(pool, admin.admin_id, body.bot_token, body.reason)
    except TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before configuring backups")


@router.post("/link-token", response_model=BackupLinkTokenOut, status_code=status.HTTP_201_CREATED)
async def create_link_token(
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    _admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    """"Guruhga qo'shish" button -- returns a t.me/<bot>?startgroup=<token>
    deep link. Telegram itself prompts the admin to pick a group to add the
    bot to and delivers the token back as a message inside that group, so
    the chat_id is auto-discovered (never typed in by hand)."""
    try:
        return await service.create_link_token(pool, settings)
    except service.TelegramNotConfiguredError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Backup bot token is not configured yet")


@router.post("/run-now", status_code=status.HTTP_202_ACCEPTED)
async def run_backup_now(_admin: PlatformAuthContext = Depends(get_current_platform_admin)):
    # Fire-and-forget onto Celery, matching every other "trigger a background
    # job from an HTTP request" endpoint in this repo -- the caller polls
    # GET /backup-settings afterward to see last_backup_status flip.
    tasks.run_daily_backup_task.delay()
    return {"queued": True}
