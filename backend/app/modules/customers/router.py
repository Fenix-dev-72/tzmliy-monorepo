from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import CUSTOMERS_MANAGE, CUSTOMERS_VIEW
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
            pool, auth.tenant_id, body.full_name, body.phone, body.responsible_user_id, body.stage
        )
    except service.ResponsibleUserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "responsible_user_id does not exist in this tenant")
    except service.DuplicatePhoneError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A customer with this phone already exists")


@router.get("", response_model=list[CustomerOut])
async def list_customers(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW))):
    return await service.list_customers(pool, auth.tenant_id)


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW))
):
    try:
        return await service.get_customer(pool, auth.tenant_id, customer_id)
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: UUID,
    body: CustomerUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CUSTOMERS_MANAGE)),
):
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
    try:
        return await service.create_customer_activity(
            pool, auth.tenant_id, customer_id, auth.user_id, body.activity_type, body.note
        )
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")


@router.get("/{customer_id}/activities", response_model=list[CustomerActivityOut])
async def list_customer_activities(
    customer_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CUSTOMERS_VIEW))
):
    try:
        return await service.list_customer_activities(pool, auth.tenant_id, customer_id)
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
