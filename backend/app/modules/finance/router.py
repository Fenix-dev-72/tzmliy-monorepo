from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import FINANCE_APPROVE, FINANCE_MANAGE, FINANCE_VIEW, SALES_MANAGE
from app.modules.finance import service
from app.modules.finance.schemas import (
    AdjustmentRequestCreate,
    AdjustmentRequestOut,
    AdjustmentReviewRequest,
    BonusPlanCreate,
    BonusPlanOut,
    PaymentCreate,
    PaymentOut,
    PayrollCalculateRequest,
    PayrollEntryOut,
    SaleLedgerOut,
)

router = APIRouter(prefix="/api/v1/finance", tags=["finance"])


@router.post("/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def record_payment(
    body: PaymentCreate,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_MANAGE)),
):
    try:
        return await service.record_payment(
            pool, auth.tenant_id, auth.user_id, body.sale_id, body.amount, body.currency, body.method, idempotency_key
        )
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different payment")


@router.get("/payments/{sale_id}", response_model=list[PaymentOut])
async def list_payments(
    sale_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    try:
        return await service.list_payments(pool, auth.tenant_id, sale_id)
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")


@router.get("/payments/{sale_id}/ledger", response_model=SaleLedgerOut)
async def get_sale_ledger(
    sale_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    try:
        return await service.get_sale_ledger(pool, auth.tenant_id, sale_id)
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")


@router.post("/adjustment-requests", response_model=AdjustmentRequestOut, status_code=status.HTTP_201_CREATED)
async def create_adjustment_request(
    body: AdjustmentRequestCreate,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(SALES_MANAGE)),
):
    try:
        return await service.create_adjustment_request(
            pool, auth.tenant_id, body.sale_id, auth.user_id, body.type, body.payload, idempotency_key
        )
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    except service.InvalidAdjustmentPayloadError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payload for this adjustment type")
    except service.RefundExceedsCollectedAmountError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Refund amount exceeds the net amount collected on this sale")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different adjustment request")


@router.get("/adjustment-requests", response_model=list[AdjustmentRequestOut])
async def list_adjustment_requests(
    status_filter: str | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_VIEW)),
):
    return await service.list_adjustment_requests(pool, auth.tenant_id, status_filter)


@router.get("/adjustment-requests/{request_id}", response_model=AdjustmentRequestOut)
async def get_adjustment_request(
    request_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    try:
        return await service.get_adjustment_request(pool, auth.tenant_id, request_id)
    except service.AdjustmentRequestNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Adjustment request not found")


@router.post("/adjustment-requests/{request_id}/approve", response_model=AdjustmentRequestOut)
async def approve_adjustment_request(
    request_id: UUID,
    body: AdjustmentReviewRequest,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_APPROVE)),
):
    try:
        return await service.approve_adjustment_request(
            pool, auth.tenant_id, request_id, auth.user_id, body.version, body.review_reason, idempotency_key
        )
    except service.AdjustmentRequestNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Adjustment request not found")
    except service.AdjustmentRequestConflictError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Adjustment request was modified concurrently; refetch and retry")
    except service.RefundExceedsCollectedAmountError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Refund amount exceeds the net amount collected on this sale")
    except service.AdjustmentApplyConflictError:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Approved, but the sale changed since this request was filed -- reconcile manually",
        )


@router.post("/adjustment-requests/{request_id}/reject", response_model=AdjustmentRequestOut)
async def reject_adjustment_request(
    request_id: UUID,
    body: AdjustmentReviewRequest,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_APPROVE)),
):
    try:
        return await service.reject_adjustment_request(
            pool, auth.tenant_id, request_id, auth.user_id, body.version, body.review_reason, idempotency_key
        )
    except service.AdjustmentRequestNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Adjustment request not found")
    except service.AdjustmentRequestConflictError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Adjustment request was modified concurrently; refetch and retry")


@router.post("/bonus-plans", response_model=BonusPlanOut, status_code=status.HTTP_201_CREATED)
async def create_bonus_plan(
    body: BonusPlanCreate,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_MANAGE)),
):
    try:
        return await service.create_bonus_plan(
            pool,
            auth.tenant_id,
            body.name,
            body.applies_to_role_id,
            body.commission_bps,
            body.effective_from,
            body.effective_to,
            idempotency_key,
        )
    except service.RoleNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "applies_to_role_id does not exist in this tenant")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different bonus plan")


@router.get("/bonus-plans", response_model=list[BonusPlanOut])
async def list_bonus_plans(pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))):
    return await service.list_bonus_plans(pool, auth.tenant_id)


@router.post("/payroll/calculate", response_model=list[PayrollEntryOut])
async def calculate_payroll(
    body: PayrollCalculateRequest,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_MANAGE)),
):
    try:
        return await service.calculate_payroll(
            pool, auth.tenant_id, auth.user_id, body.period_start, body.period_end, body.user_id
        )
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    except service.UserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id does not exist in this tenant")


@router.get("/payroll", response_model=list[PayrollEntryOut])
async def list_payroll_entries(
    user_id: UUID | None = None,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_VIEW)),
):
    return await service.list_payroll_entries(pool, auth.tenant_id, user_id)
