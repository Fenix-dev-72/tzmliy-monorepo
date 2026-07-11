import json
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status

from app.core.config import Settings, get_settings
from app.core.deps import AuthContext, PlatformAuthContext, get_current_platform_admin, get_current_user, get_pool, require_permission
from app.modules.auth.permissions import BILLING_MANAGE, BILLING_VIEW
from app.modules.billing import providers, service
from app.modules.billing.providers import PaymeProvider
from app.modules.billing.schemas import (
    BillingPlanOut,
    BillingPlanUpdate,
    DunningRunResultOut,
    ManualInvoiceCreate,
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    ReasonRequest,
    StorageUsageOut,
    SubscriptionAssignRequest,
    SubscriptionPaymentOut,
    SubscriptionSelectRequest,
    TenantSubscriptionOut,
)

payme_provider = PaymeProvider()


def _payme_message(text: str) -> dict:
    return {"ru": text, "uz": text, "en": text}


# --- Tenant-facing -----------------------------------------------------------

tenant_router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


@tenant_router.get("/plans", response_model=list[BillingPlanOut])
async def list_plans(pool=Depends(get_pool), _auth: AuthContext = Depends(get_current_user)):
    return await service.list_billing_plans(pool)


@tenant_router.get("/subscription", response_model=TenantSubscriptionOut)
async def get_subscription(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(BILLING_VIEW))):
    try:
        return await service.get_subscription(pool, auth.tenant_id)
    except service.SubscriptionNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription assigned to this tenant yet")


@tenant_router.post("/subscription", response_model=TenantSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def select_own_subscription(
    body: SubscriptionSelectRequest, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(BILLING_VIEW))
):
    try:
        return await service.select_own_subscription(pool, auth.tenant_id, body.billing_plan_code)
    except service.PlanNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown plan code")


@tenant_router.get("/usage", response_model=StorageUsageOut)
async def get_usage(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(BILLING_VIEW))):
    try:
        return await service.get_usage(pool, auth.tenant_id)
    except service.UsageNotComputedYetError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Storage usage has not been computed yet")


@tenant_router.get("/payments", response_model=list[SubscriptionPaymentOut])
async def list_payments(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(BILLING_VIEW))):
    return await service.list_payments(pool, auth.tenant_id)


@tenant_router.post("/payments/initiate", response_model=PaymentInitiateResponse, status_code=status.HTTP_201_CREATED)
async def initiate_payment(
    body: PaymentInitiateRequest,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    auth: AuthContext = Depends(require_permission(BILLING_MANAGE)),
):
    try:
        return await service.initiate_payment(pool, settings, auth.tenant_id, auth.user_id, body.provider, idempotency_key)
    except service.SubscriptionNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription assigned to this tenant yet")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different payment")


# --- Unauthenticated webhook/RPC (signature/auth header is the authentication) ---

webhook_router = APIRouter(prefix="/api/v1/billing/webhooks", tags=["billing-webhooks"])


@webhook_router.post("/payme")
async def payme_rpc(request: Request, pool=Depends(get_pool), settings: Settings = Depends(get_settings)):
    raw = await request.body()
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": {"code": providers.PAYME_ERROR_PARSE_ERROR, "message": _payme_message("Parse error")}, "id": None}

    request_id = body.get("id")
    if not payme_provider.verify_auth(dict(request.headers), settings.payme_secret_key):
        return {
            "error": {"code": providers.PAYME_ERROR_INSUFFICIENT_PRIVILEGE, "message": _payme_message("Insufficient privilege")},
            "id": request_id,
        }

    method = body.get("method")
    params = body.get("params") or {}
    try:
        result = await service.handle_payme_rpc(pool, method, params)
    except service.PaymeRpcError as exc:
        return {"error": {"code": exc.code, "message": _payme_message(exc.message)}, "id": request_id}
    except (KeyError, ValueError, TypeError):
        return {"error": {"code": providers.PAYME_ERROR_INVALID_PARAMS, "message": _payme_message("Invalid params")}, "id": request_id}
    return {"result": result, "id": request_id}


@webhook_router.post("/click")
async def click_webhook(request: Request, pool=Depends(get_pool), settings: Settings = Depends(get_settings)):
    form = await request.form()
    params = dict(form)
    try:
        return await service.handle_click_webhook(pool, settings, params)
    except service.ClickError as exc:
        return {
            "click_trans_id": exc.params.get("click_trans_id"),
            "merchant_trans_id": exc.params.get("merchant_trans_id"),
            "error": exc.code,
            "error_note": exc.message,
        }
    except (KeyError, ValueError, TypeError):
        return {
            "click_trans_id": params.get("click_trans_id"),
            "merchant_trans_id": params.get("merchant_trans_id"),
            "error": providers.CLICK_ERROR_BAD_REQUEST,
            "error_note": "Bad request",
        }


# --- Platform-facing ---------------------------------------------------------

platform_router = APIRouter(prefix="/platform/v1", tags=["billing-platform"])


@platform_router.get("/billing/plans", response_model=list[BillingPlanOut])
async def platform_list_plans(pool=Depends(get_pool), _admin: PlatformAuthContext = Depends(get_current_platform_admin)):
    return await service.list_billing_plans(pool)


@platform_router.patch("/billing/plans/{code}", response_model=BillingPlanOut)
async def platform_update_plan(
    code: str,
    body: BillingPlanUpdate,
    pool=Depends(get_pool),
    _admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.update_billing_plan(
            pool, code, body.price_amount, body.currency, body.max_users, body.max_billable_storage_bytes, body.is_active
        )
    except service.PlanNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown plan code")


@platform_router.get("/tenants/{tenant_id}/subscription", response_model=TenantSubscriptionOut)
async def platform_get_subscription(
    tenant_id: UUID,
    reason: str = Query(min_length=3),
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.get_subscription_as_admin(pool, admin.admin_id, tenant_id, reason)
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")
    except service.SubscriptionNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription assigned to this tenant yet")


@platform_router.post("/tenants/{tenant_id}/subscription", response_model=TenantSubscriptionOut)
async def platform_assign_subscription(
    tenant_id: UUID,
    body: SubscriptionAssignRequest,
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.assign_subscription(
            pool, admin.admin_id, tenant_id, body.billing_plan_code, body.current_period_start, body.reason
        )
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")
    except service.PlanNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown plan code")


@platform_router.get("/tenants/{tenant_id}/invoices", response_model=list[SubscriptionPaymentOut])
async def platform_list_invoices(
    tenant_id: UUID,
    reason: str = Query(min_length=3),
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.list_invoices_as_admin(pool, admin.admin_id, tenant_id, reason)
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")


@platform_router.post(
    "/tenants/{tenant_id}/invoices", response_model=SubscriptionPaymentOut, status_code=status.HTTP_201_CREATED
)
async def platform_create_manual_invoice(
    tenant_id: UUID,
    body: ManualInvoiceCreate,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.create_manual_invoice(
            pool,
            admin.admin_id,
            tenant_id,
            body.amount,
            body.currency,
            body.period_start,
            body.period_end,
            body.reason,
            idempotency_key,
        )
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")
    except service.SubscriptionNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription assigned to this tenant yet")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different invoice")


@platform_router.post("/tenants/{tenant_id}/invoices/{payment_id}/mark-paid", response_model=SubscriptionPaymentOut)
async def platform_mark_invoice_paid(
    tenant_id: UUID,
    payment_id: UUID,
    body: ReasonRequest,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.mark_invoice_paid(pool, admin.admin_id, tenant_id, payment_id, body.reason, idempotency_key)
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")
    except service.InvoiceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    except service.InvoiceNotPendingError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice is not pending")


@platform_router.post("/tenants/{tenant_id}/storage/recalculate", response_model=StorageUsageOut)
async def platform_recalculate_storage(
    tenant_id: UUID,
    body: ReasonRequest,
    pool=Depends(get_pool),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.recalculate_storage(pool, admin.admin_id, tenant_id, body.reason)
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")
    except service.SubscriptionNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription assigned to this tenant yet")


@platform_router.post("/billing/dunning/run", response_model=list[DunningRunResultOut])
async def platform_run_dunning(
    body: ReasonRequest,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    admin: PlatformAuthContext = Depends(get_current_platform_admin),
):
    try:
        return await service.run_dunning(pool, admin.admin_id, settings, body.reason)
    except service.TwoFactorRequiredError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform Admin must enable 2FA before accessing tenant data")
