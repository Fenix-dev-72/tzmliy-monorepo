import time

from prometheus_client import Counter, Gauge, Histogram, Info, generate_latest
from starlette.requests import Request
from starlette.responses import Response


REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

REQUEST_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "HTTP requests currently in progress",
    ["method"],
)

DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "Database query duration in seconds",
    ["query_name"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

REDIS_OPERATION_DURATION = Histogram(
    "redis_operation_duration_seconds",
    "Redis operation duration in seconds",
    ["operation"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5),
)

CACHE_HITS = Counter("cache_hits_total", "Cache hits", ["cache_name"])
CACHE_MISSES = Counter("cache_misses_total", "Cache misses", ["cache_name"])

ACTIVE_USERS = Gauge("active_users", "Currently active users (recent requests)")

WORKER_TASKS = Gauge("background_worker_tasks", "Background worker tasks running", ["worker_name"])

APP_INFO = Info("app", "Application info")


def _normalize_endpoint(path: str) -> str:
    parts = path.strip("/").split("/")
    if len(parts) <= 3:
        return "/" + "/".join(parts)
    normalized = []
    for i, part in enumerate(parts):
        if i >= 3 and not part.startswith("api"):
            try:
                int(part.replace("-", "").replace("_", ""))
                normalized.append("{id}")
                continue
            except ValueError:
                pass
            if len(part) > 8 and all(c.isalnum() or c == "-" for c in part):
                normalized.append("{id}")
                continue
        normalized.append(part)
    return "/" + "/".join(normalized)


class MetricsMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "UNKNOWN")
        path = scope.get("path", "/")

        REQUEST_IN_PROGRESS.labels(method=method).inc()
        start_time = time.perf_counter()

        status_code = 500

        async def send_wrapper(message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = time.perf_counter() - start_time
            endpoint = _normalize_endpoint(path)
            REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=str(status_code)).inc()
            REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration)
            REQUEST_IN_PROGRESS.labels(method=method).dec()


async def metrics_endpoint(request: Request) -> Response:
    return Response(content=generate_latest(), media_type="text/plain; version=0.0.4; charset=utf-8")
