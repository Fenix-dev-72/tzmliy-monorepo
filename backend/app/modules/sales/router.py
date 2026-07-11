from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import SALES_MANAGE, SALES_VIEW
from app.modules.finance import service as finance_service
from app.modules.sales import service
from app.modules.sales.schemas import SaleChangeOut, SaleCreate, SaleOut, SaleUpdate

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])


@router.post("", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
async def create_sale(
    body: SaleCreate,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(SALES_MANAGE)),
):
    try:
        sale, is_new = await service.create_sale(
            pool,
            auth.tenant_id,
            body.customer_id,
            body.catalog_category_id,
            body.responsible_user_id,
            body.currency,
            body.price_amount,
            body.deadline,
            idempotency_key,
        )
    except service.CustomerNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "customer_id does not exist in this tenant")
    except service.CatalogCategoryNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "catalog_category_id does not exist in this tenant")
    except service.ResponsibleUserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "responsible_user_id does not exist in this tenant")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different sale")
    if is_new:
        await finance_service.post_charge(
            pool, auth.tenant_id, sale["id"], sale["customer_id"], sale["price_amount"], sale["currency"], auth.user_id
        )
    return sale


@router.get("", response_model=list[SaleOut])
async def list_sales(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(SALES_VIEW))):
    return await service.list_sales(pool, auth.tenant_id)


@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale(
    sale_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(SALES_VIEW))
):
    try:
        return await service.get_sale(pool, auth.tenant_id, sale_id)
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")


@router.patch("/{sale_id}", response_model=SaleOut)
async def update_sale(
    sale_id: UUID,
    body: SaleUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(SALES_MANAGE)),
):
    try:
        return await service.update_sale(
            pool,
            auth.tenant_id,
            sale_id,
            auth.user_id,
            body.catalog_category_id,
            body.responsible_user_id,
            body.price_amount,
            body.deadline,
            body.status,
            body.version,
            body.reason,
        )
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    except service.SaleVersionConflictError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sale was modified concurrently; refetch and retry")
    except service.InvalidStatusTransitionError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sale status is terminal and cannot be changed")
    except service.CatalogCategoryNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "catalog_category_id does not exist in this tenant")
    except service.ResponsibleUserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "responsible_user_id does not exist in this tenant")


@router.get("/{sale_id}/changes", response_model=list[SaleChangeOut])
async def list_sale_changes(
    sale_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(SALES_VIEW))
):
    try:
        return await service.list_sale_changes(pool, auth.tenant_id, sale_id)
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
