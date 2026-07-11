from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import CALLS_MANAGE, CALLS_VIEW
from app.modules.calls import service
from app.modules.calls.providers import UnknownProviderError
from app.modules.calls.schemas import (
    CallOut,
    IntegrationCredentialCreate,
    IntegrationCredentialOut,
    ManagerMappingCreate,
    ManagerMappingOut,
    RecordingUrlOut,
)

router = APIRouter(prefix="/api/v1/calls", tags=["calls"])


@router.post("/webhooks/{provider}/{tenant_id}")
async def ingest_webhook(provider: str, tenant_id: UUID, request: Request, pool=Depends(get_pool)):
    raw_body = await request.body()
    try:
        return await service.ingest_webhook(pool, provider, tenant_id, raw_body, dict(request.headers))
    except UnknownProviderError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown call provider")
    except service.IntegrationNotConfiguredError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not configured for this tenant")
    except service.InvalidSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")


@router.post("/integrations", response_model=IntegrationCredentialOut, status_code=status.HTTP_201_CREATED)
async def configure_integration(
    body: IntegrationCredentialCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CALLS_MANAGE)),
):
    return await service.configure_integration(pool, auth.tenant_id, body.provider, body.webhook_secret, body.api_key)


@router.get("/integrations", response_model=list[IntegrationCredentialOut])
async def list_integrations(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))):
    return await service.list_integrations(pool, auth.tenant_id)


@router.post("/manager-mappings", response_model=ManagerMappingOut, status_code=status.HTTP_201_CREATED)
async def create_manager_mapping(
    body: ManagerMappingCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CALLS_MANAGE)),
):
    try:
        return await service.create_manager_mapping(
            pool, auth.tenant_id, body.provider, body.external_agent_id, body.user_id
        )
    except service.UserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id does not exist in this tenant")


@router.get("/manager-mappings", response_model=list[ManagerMappingOut])
async def list_manager_mappings(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))):
    return await service.list_manager_mappings(pool, auth.tenant_id)


@router.get("/calls", response_model=list[CallOut])
async def list_calls(
    responsible_user_id: UUID | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CALLS_VIEW)),
):
    return await service.list_calls(pool, auth.tenant_id, responsible_user_id)


@router.get("/calls/{call_id}", response_model=CallOut)
async def get_call(call_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))):
    try:
        return await service.get_call(pool, auth.tenant_id, call_id)
    except service.CallNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")


@router.get("/calls/{call_id}/recording", response_model=RecordingUrlOut)
async def get_recording_url(
    call_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CALLS_VIEW))
):
    try:
        url = await service.get_recording_url(pool, auth.tenant_id, call_id)
    except service.CallNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")
    except service.RecordingNotAvailableError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No recording available for this call")
    return {"url": url}
