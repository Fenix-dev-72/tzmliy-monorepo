import json
import logging
import sys
import time
import uuid
from typing import Any


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "tenant_id"):
            log_data["tenant_id"] = record.tenant_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "path"):
            log_data["path"] = record.path
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "client_ip"):
            log_data["client_ip"] = record.client_ip
        if hasattr(record, "extra_data"):
            log_data.update(record.extra_data)

        return json.dumps(log_data, default=str, ensure_ascii=False)


def setup_structured_logging(json_format: bool = False) -> None:
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    if json_format:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))

    root.addHandler(handler)
    root.setLevel(logging.INFO)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        import contextvars
        request_id_var = contextvars.ContextVar("request_id", default=None)
        tenant_id_var = contextvars.ContextVar("tenant_id", default=None)
        user_id_var = contextvars.ContextVar("user_id", default=None)

        rid = request_id_var.get()
        tid = tenant_id_var.get()
        uid = user_id_var.get()

        if rid:
            record.request_id = rid
        if tid:
            record.tenant_id = tid
        if uid:
            record.user_id = uid

        return True


def generate_request_id() -> str:
    return uuid.uuid4().hex[:16]


class RequestLoggingMiddleware:
    def __init__(self, app) -> None:
        self.app = app
        self.logger = logging.getLogger("dashboarduz.request")

    def _client_ip(self, scope: dict) -> str:
        client = scope.get("client")
        return client[0] if client else "unknown"

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        import contextvars
        request_id_var = contextvars.ContextVar("request_id", default=None)
        tenant_id_var = contextvars.ContextVar("tenant_id", default=None)
        user_id_var = contextvars.ContextVar("user_id", default=None)

        request_id = generate_request_id()
        request_id_var.set(request_id)

        method = scope.get("method", "UNKNOWN")
        path = scope.get("path", "/")
        client_ip = self._client_ip(scope)

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
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            extra = {
                "request_id": request_id,
                "method": method,
                "path": path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "client_ip": client_ip,
            }

            log_record = self.logger.makeRecord(
                self.logger.name,
                logging.INFO,
                "",
                0,
                f"{method} {path} -> {status_code} ({duration_ms}ms)",
                (),
                None,
            )
            for k, v in extra.items():
                setattr(log_record, k, v)
            self.logger.handle(log_record)

            request_id_var.set(None)
            tenant_id_var.set(None)
            user_id_var.set(None)
