import asyncio
import io
from uuid import UUID

import asyncpg
from PIL import Image, UnidentifiedImageError

from app.core.database import tenant_connection
from app.core.storage import presigned_get_url, put_object
from app.modules.products import repository

# Product photos are re-encoded to WebP before storage (2026-07-17, explicit
# request to cut object-storage/bandwidth load) -- WebP typically comes out
# 25-35% smaller than an equivalent-quality JPEG/PNG, and every consumer
# (presigned photo-url fetches on ProductsPage/WarehouseCard/WarehousePage)
# is a plain <img>, so a smaller file is a strictly free win with no format
# support cost (every browser this app targets renders WebP natively).
_MAX_PHOTO_DIMENSION = 1600
_WEBP_QUALITY = 82


class CategoryNotFoundError(Exception):
    pass


class ProductNotFoundError(Exception):
    pass


class InsufficientStockError(Exception):
    pass


class PhotoNotAvailableError(Exception):
    pass


class ProductInUseError(Exception):
    pass


class InvalidPhotoError(Exception):
    pass


def _convert_to_webp_sync(data: bytes) -> bytes:
    """CPU-bound (Pillow decode/resize/encode), so this must only ever be
    called via asyncio.to_thread -- same blocking-call convention as bcrypt
    in core/security.py and boto3 in core/storage.py. Downscales anything
    larger than _MAX_PHOTO_DIMENSION on its long edge (a product photo
    doesn't need to be bigger than it'll ever be displayed) and re-encodes
    to WebP; RGBA is preserved so a transparent PNG upload doesn't grow a
    fake black/white background."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise InvalidPhotoError from exc
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    image.thumbnail((_MAX_PHOTO_DIMENSION, _MAX_PHOTO_DIMENSION), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=_WEBP_QUALITY, method=6)
    return buffer.getvalue()


async def create_product(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    category_id: UUID,
    name: str,
    cost_price_amount: int,
    cost_price_currency: str,
    sell_price_amount: int,
    sell_price_currency: str,
    stock_quantity: int,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if not await repository.category_exists(conn, category_id):
            raise CategoryNotFoundError
        return await repository.insert_product(
            conn, tenant_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency, stock_quantity
        )


async def list_products(pool: asyncpg.Pool, tenant_id: UUID, category_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_products(conn, category_id)


async def update_product(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    product_id: UUID,
    category_id: UUID,
    name: str,
    cost_price_amount: int,
    cost_price_currency: str,
    sell_price_amount: int,
    sell_price_currency: str,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        product = await repository.get_product_by_id(conn, product_id)
        if product is None:
            raise ProductNotFoundError
        if not await repository.category_exists(conn, category_id):
            raise CategoryNotFoundError
        await repository.update_product(
            conn, product_id, category_id, name, cost_price_amount, cost_price_currency, sell_price_amount, sell_price_currency
        )
        return {
            **product,
            "category_id": category_id,
            "name": name,
            "cost_price_amount": cost_price_amount,
            "cost_price_currency": cost_price_currency,
            "sell_price_amount": sell_price_amount,
            "sell_price_currency": sell_price_currency,
        }


async def delete_product(pool: asyncpg.Pool, tenant_id: UUID, product_id: UUID) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_product_by_id(conn, product_id) is None:
            raise ProductNotFoundError
        try:
            await repository.delete_product(conn, product_id)
        except asyncpg.ForeignKeyViolationError as exc:
            raise ProductInUseError from exc


async def adjust_stock(pool: asyncpg.Pool, tenant_id: UUID, product_id: UUID, delta: int) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_product_by_id(conn, product_id) is None:
            raise ProductNotFoundError
        updated = await repository.adjust_stock(conn, product_id, delta)
        if updated is None:
            raise InsufficientStockError
        return updated


async def upload_photo(pool: asyncpg.Pool, tenant_id: UUID, product_id: UUID, data: bytes) -> None:
    webp_data = await asyncio.to_thread(_convert_to_webp_sync, data)
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_product_by_id(conn, product_id) is None:
            raise ProductNotFoundError
        object_key = f"product-photos/{tenant_id}/{product_id}.webp"
        await put_object(object_key, webp_data, "image/webp")
        await repository.set_product_photo(conn, product_id, object_key)


async def get_photo_url(pool: asyncpg.Pool, tenant_id: UUID, product_id: UUID) -> str:
    async with tenant_connection(pool, tenant_id) as conn:
        product = await repository.get_product_by_id(conn, product_id)
    if product is None:
        raise ProductNotFoundError
    if product["photo_object_key"] is None:
        raise PhotoNotAvailableError
    return await presigned_get_url(product["photo_object_key"])
