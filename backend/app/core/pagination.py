from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    """Envelope for numbered-pagination list endpoints (2026-07-28) --
    replaces the bare `list[T]` response these endpoints used to return.
    `total` is the full row count under the same filters as `items` (not
    just this page), so the frontend can render page-number buttons instead
    of an unbounded "load more" button."""

    items: list[T]
    total: int
