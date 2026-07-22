from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import CATALOG_MANAGE, CATALOG_VIEW
from app.modules.catalog import service
from app.modules.catalog.schemas import CategoryCreate, CategoryNode, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/api/v1/catalog/categories", tags=["catalog"])


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        return await service.create_category(pool, auth.tenant_id, body.name, body.parent_id)
    except service.ParentNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "parent_id does not exist in this tenant")
    except service.DuplicateNameError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A sibling category with this name already exists")


@router.get("", response_model=list[CategoryNode])
async def list_categories(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(CATALOG_VIEW))):
    return await service.list_categories_tree(pool, auth.tenant_id)


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        return await service.update_category(pool, auth.tenant_id, category_id, body.name)
    except service.CategoryNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    except service.DuplicateNameError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A sibling category with this name already exists")


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: UUID,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(CATALOG_MANAGE)),
):
    try:
        await service.delete_category(pool, auth.tenant_id, category_id)
    except service.CategoryNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    except service.CategoryHasChildrenError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Delete child categories first")
    except service.CategoryHasProductsError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Delete or move this category's products first")
