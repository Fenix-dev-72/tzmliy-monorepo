from collections.abc import Callable

from fastapi import Depends, HTTPException, status

from app.core.deps import AuthContext, get_current_user, get_pool
from app.modules.billing import service


def require_plan_feature(feature_key: str) -> Callable:
    """Unlike core/deps.py's require_permission (a pure JWT-claim check),
    this needs a live DB read every request -- a plan change must take
    effect immediately (an admin unlocking a feature shouldn't require every
    user to log out and back in), so there's no claim-caching trade-off here
    the way there is for RBAC permissions."""

    async def checker(pool=Depends(get_pool), auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        entitlements = await service.get_entitlements(pool, auth.tenant_id)
        if feature_key not in entitlements["feature_keys"]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"This feature requires a plan upgrade: {feature_key}")
        return auth

    return checker
