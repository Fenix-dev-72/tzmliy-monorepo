from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import CUSTOMERS_MANAGE, CUSTOMERS_VIEW, CUSTOMERS_VIEW_ALL
from app.modules.customers import service
from app.modules.customers.schemas import (
    CustomerActivityCreate,
    CustomerActivityOut,
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
)

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CUSTOMERS_MANAGE)),
):
    try:
        return await service.create_customer(
            pool,
            auth.tenant_id,
            body.full_name,
            body.phone,
            body.responsible_user_id,
            body.stage,
            created_by_user_id=auth.user_id,
        )
    except service.ResponsibleUserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "responsible_user_id does not exist in this tenant")
    except service.DuplicatePhoneError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A customer with this phone already exists")


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW)),
):
    can_view_all = CUSTOMERS_VIEW_ALL in auth.permissions
    return await service.list_customers(pool, auth.tenant_id, auth.user_id, can_view_all, limit, offset)


@router.get("/by-phone", response_model=CustomerOut)
async def get_customer_by_phone(
    phone: str = Query(min_length=1),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW)),
):
    """Declared before /{customer_id} -- a static path segment must be
    matched first, or FastAPI would try (and fail) to parse "by-phone" as a
    customer_id UUID."""
    try:
        return await service.get_customer_by_phone(pool, auth.tenant_id, phone)
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No customer with this phone number")


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW))
):
    can_view_all = CUSTOMERS_VIEW_ALL in auth.permissions
    try:
        return await service.get_customer(pool, auth.tenant_id, customer_id, auth.user_id, can_view_all)
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: UUID,
    body: CustomerUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CUSTOMERS_MANAGE)),
):
    can_view_all = CUSTOMERS_VIEW_ALL in auth.permissions
    try:
        return await service.update_customer(
            pool,
            auth.tenant_id,
            customer_id,
            auth.user_id,
            body.full_name,
            body.phone,
            body.responsible_user_id,
            body.stage,
            can_view_all,
        )
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    except service.ResponsibleUserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "responsible_user_id does not exist in this tenant")
    except service.DuplicatePhoneError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A customer with this phone already exists")


@router.post(
    "/{customer_id}/activities", response_model=CustomerActivityOut, status_code=status.HTTP_201_CREATED
)
async def create_customer_activity(
    customer_id: UUID,
    body: CustomerActivityCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CUSTOMERS_MANAGE)),
):
    can_view_all = CUSTOMERS_VIEW_ALL in auth.permissions
    try:
        return await service.create_customer_activity(
            pool, auth.tenant_id, customer_id, auth.user_id, body.activity_type, body.note, can_view_all
        )
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")


@router.get("/{customer_id}/activities", response_model=list[CustomerActivityOut])
async def list_customer_activities(
    customer_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW))
):
    can_view_all = CUSTOMERS_VIEW_ALL in auth.permissions
    try:
        return await service.list_customer_activities(pool, auth.tenant_id, customer_id, auth.user_id, can_view_all)
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
