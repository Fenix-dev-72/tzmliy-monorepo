from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.deps import AuthContext, get_pool, require_permission
from app.modules.auth.permissions import FINANCE_APPROVE, FINANCE_MANAGE, FINANCE_VIEW, FINANCE_VIEW_ALL, SALES_MANAGE
from app.modules.finance import service
from app.modules.finance.schemas import (
    AdjustmentRequestCreate,
    AdjustmentRequestOut,
    AdjustmentReviewRequest,
    BonusPlanCreate,
    BonusPlanOut,
    CustomerOutstandingSaleOut,
    LedgerEntryOut,
    PaymentCreate,
    PaymentOut,
    PayrollCalculateRequest,
    PayrollEntryOut,
    PayrollJobOut,
    ProfitSummaryEntryOut,
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
    except service.SaleCancelledError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot record a payment on a cancelled sale")
    except service.PaymentCurrencyMismatchError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment currency must match the sale's currency")
    except service.PaymentExceedsBalanceError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Payment amount exceeds the outstanding balance")
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different payment")


@router.post("/payments/{payment_id}/reverse", response_model=LedgerEntryOut, status_code=status.HTTP_201_CREATED)
async def reverse_payment(
    payment_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_MANAGE))
):
    try:
        return await service.reverse_payment(pool, auth.tenant_id, auth.user_id, payment_id)
    except service.PaymentNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    except service.PaymentAlreadyReversedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Payment was already reversed")
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")


@router.get("/payments/{sale_id}", response_model=list[PaymentOut])
async def list_payments(
    sale_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    can_view_all = FINANCE_VIEW_ALL in auth.permissions
    try:
        return await service.list_payments(pool, auth.tenant_id, sale_id, auth.user_id, can_view_all)
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")


@router.get("/payments/{sale_id}/ledger", response_model=SaleLedgerOut)
async def get_sale_ledger(
    sale_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    can_view_all = FINANCE_VIEW_ALL in auth.permissions
    try:
        return await service.get_sale_ledger(pool, auth.tenant_id, sale_id, auth.user_id, can_view_all)
    except service.SaleNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")


@router.get("/customers/{customer_id}/outstanding", response_model=list[CustomerOutstandingSaleOut])
async def get_customer_outstanding_sales(
    customer_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    can_view_all = FINANCE_VIEW_ALL in auth.permissions
    return await service.get_customer_outstanding_sales(pool, auth.tenant_id, customer_id, auth.user_id, can_view_all)


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
    can_view_all = FINANCE_VIEW_ALL in auth.permissions
    return await service.list_adjustment_requests(pool, auth.tenant_id, status_filter, auth.user_id, can_view_all)


@router.get("/adjustment-requests/{request_id}", response_model=AdjustmentRequestOut)
async def get_adjustment_request(
    request_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    can_view_all = FINANCE_VIEW_ALL in auth.permissions
    try:
        return await service.get_adjustment_request(pool, auth.tenant_id, request_id, auth.user_id, can_view_all)
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
            body.bonus_type,
            body.commission_bps,
            body.fixed_amount,
            body.fixed_amount_currency,
            body.catalog_category_id,
            body.effective_from,
            body.effective_to,
            idempotency_key,
        )
    except service.RoleNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "applies_to_role_id does not exist in this tenant")
    except service.CategoryNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "catalog_category_id does not exist in this tenant")
    except service.InvalidBonusPlanError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "fixed_per_sale requires fixed_amount and fixed_amount_currency; percent requires neither",
        )
    except service.IdempotencyKeyReusedError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency-Key already used for a different bonus plan")


@router.get("/bonus-plans", response_model=list[BonusPlanOut])
async def list_bonus_plans(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_VIEW)),
):
    return await service.list_bonus_plans(pool, auth.tenant_id, limit, offset)


@router.post("/payroll/calculate", response_model=PayrollJobOut, status_code=status.HTTP_202_ACCEPTED)
async def calculate_payroll(
    body: PayrollCalculateRequest,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_MANAGE)),
):
    """Enqueues the calculation instead of running it synchronously --
    payroll_worker.py picks it up in the background (typically within
    finance_payroll_worker_poll_seconds). Poll GET /payroll/jobs/{id} for
    status, then GET /payroll for the resulting entries once status=done."""
    try:
        return await service.enqueue_payroll_calculation(
            pool, auth.tenant_id, auth.user_id, body.period_start, body.period_end, body.user_id
        )
    except service.InvalidPeriodError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period_end must be after period_start")
    except service.UserNotFoundError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user_id does not exist in this tenant")


@router.get("/payroll/jobs/{job_id}", response_model=PayrollJobOut)
async def get_payroll_job(
    job_id: UUID, pool=Depends(get_pool), auth: AuthContext = Depends(require_permission(FINANCE_VIEW))
):
    try:
        return await service.get_payroll_job(pool, auth.tenant_id, job_id)
    except service.PayrollJobNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll job not found")


@router.get("/payroll", response_model=list[PayrollEntryOut])
async def list_payroll_entries(
    user_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_VIEW)),
):
    can_view_all = FINANCE_VIEW_ALL in auth.permissions
    return await service.list_payroll_entries(pool, auth.tenant_id, user_id, auth.user_id, can_view_all, limit, offset)


@router.get("/profit-summary", response_model=list[ProfitSummaryEntryOut])
async def get_profit_summary(
    period_start: datetime,
    period_end: datetime,
    pool=Depends(get_pool),
    auth: AuthContext = Depends(require_permission(FINANCE_VIEW)),
):
    return await service.get_profit_summary(pool, auth.tenant_id, period_start, period_end)
