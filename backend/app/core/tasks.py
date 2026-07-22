"""Celery tasks for OTP/code delivery -- wraps the existing, unchanged sync
senders in core/notify.py (no duplicate delivery logic), just moved to run
in a real background worker process (dashboarduz-celery.service) instead of
asyncio.to_thread inside the request-handling process. See celery_app.py.
"""

import logging

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.core.notify import _send_via_smtp_sync, _send_via_telegram_gateway_sync

logger = logging.getLogger("dashboarduz.tasks")


@celery_app.task(name="notify.send_email_code", bind=True, max_retries=3, default_retry_delay=10)
def send_email_code_task(self, destination: str, code: str, link: str | None) -> None:
    settings = get_settings()
    if not settings.smtp_username or not settings.smtp_password or not settings.smtp_sender_email:
        logger.warning("SMTP not configured (smtp_username/smtp_password/smtp_sender_email empty) -- code only logged, not delivered")
        return
    try:
        _send_via_smtp_sync(settings, destination, code, link)
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="notify.send_sms_code", bind=True, max_retries=3, default_retry_delay=10)
def send_sms_code_task(self, destination: str, code: str) -> None:
    settings = get_settings()
    if not settings.telegram_gateway_api_token:
        logger.warning("Telegram Gateway not configured (telegram_gateway_api_token empty) -- code only logged, not delivered")
        return
    try:
        _send_via_telegram_gateway_sync(settings.telegram_gateway_api_token, destination, code)
    except Exception as exc:
        raise self.retry(exc=exc)
