from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import CATALOG_MANAGE, CATALOG_VIEW
from app.modules.products import service
from app.modules.products.schemas import ProductCreate, ProductOut, ProductPhotoUrlOut, ProductUpdate, StockAdjust

router = APIRouter(prefix="/api/v1/products", tags=["products"])

MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        return await service.create_product(
            pool,
            auth.tenant_id,
            body.category_id,
            body.name,
            body.cost_price_amount,
            body.cost_price_currency,
            body.sell_price_amount,
            body.sell_price_currency,
            body.stock_quantity,
        )
    except service.CategoryNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "category_id does not exist in this tenant")


@router.get("", response_model=list[ProductOut])
async def list_products(
    category_id: UUID | None = Query(None),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_VIEW)),
):
    return await service.list_products(pool, auth.tenant_id, category_id)


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: UUID,
    body: ProductUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        return await service.update_product(
            pool,
            auth.tenant_id,
            product_id,
            body.category_id,
            body.name,
            body.cost_price_amount,
            body.cost_price_currency,
            body.sell_price_amount,
            body.sell_price_currency,
        )
    except service.ProductNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    except service.CategoryNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "category_id does not exist in this tenant")


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        await service.delete_product(pool, auth.tenant_id, product_id)
    except service.ProductNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    except service.ProductInUseError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete a product that has sales")


@router.post("/{product_id}/stock-adjust", response_model=ProductOut)
async def adjust_stock(
    product_id: UUID,
    body: StockAdjust,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        return await service.adjust_stock(pool, auth.tenant_id, product_id, body.delta)
    except service.ProductNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    except service.InsufficientStockError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Stock cannot go below zero")


@router.post("/{product_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
async def upload_photo(
    product_id: UUID,
    file: UploadFile = File(...),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    if file.content_type not in ALLOWED_PHOTO_CONTENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only JPEG/PNG/WEBP photos are allowed")
    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo must be under 5MB")
    try:
        await service.upload_photo(pool, auth.tenant_id, product_id, data)
    except service.ProductNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    except service.InvalidPhotoError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo file is corrupted or unreadable")


@router.get("/{product_id}/photo-url", response_model=ProductPhotoUrlOut)
async def get_photo_url(
    product_id: UUID,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_VIEW)),
):
    try:
        return ProductPhotoUrlOut(photo_url=await service.get_photo_url(pool, auth.tenant_id, product_id))
    except service.ProductNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    except service.PhotoNotAvailableError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product has no photo")
