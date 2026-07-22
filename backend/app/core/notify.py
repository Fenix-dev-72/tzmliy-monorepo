import asyncio
import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from app.core.config import Settings

logger = logging.getLogger("dashboarduz.notify")

_GATEWAY_API_BASE = "https://gatewayapi.telegram.org"


def _send_via_telegram_gateway_sync(token: str, phone: str, code: str) -> None:
    body = json.dumps({"phone_number": phone, "code": code}).encode()
    request = urllib.request.Request(
        f"{_GATEWAY_API_BASE}/sendVerificationMessage",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
    result = json.loads(raw)
    if not result.get("ok"):
        raise RuntimeError(f"Telegram Gateway error: {result.get('error')}")


def _send_via_smtp_sync(settings: Settings, destination: str, code: str, link: str | None) -> None:
    message = EmailMessage()
    message["From"] = f"{settings.smtp_sender_name} <{settings.smtp_sender_email}>"
    message["To"] = destination
    if link:
        message["Subject"] = "Dashboarduz -- parolni tiklash"
        message.set_content(
            f"Parolni tiklash uchun quyidagi havolani bosing:\n\n{link}\n\n"
            f"Havolani siz so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring."
        )
    else:
        message["Subject"] = "Dashboarduz -- tasdiqlash kodi"
        message.set_content(f"Sizning tasdiqlash kodingiz: {code}\n\nUshbu kodni hech kimga bermang.")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


async def send_code(*, channel: str, destination: str, code: str, link: str | None = None) -> None:
    """OTP / password-reset code delivery -- enqueues a Celery task
    (core/tasks.py) and returns immediately; the actual SMTP/Telegram
    Gateway call happens in the separate dashboarduz-celery.service worker
    process (2026-07-12, moved off the request path per explicit user
    request), not inline in this request.

    SMS (`channel="sms"`, used by phone OTP) is actually delivered via
    Telegram's official Gateway API (`Settings.telegram_gateway_api_token`,
    https://core.telegram.org/gateway) rather than a real SMS provider --
    it sends the code as a Telegram message to whichever Telegram account is
    registered under that phone number, no per-user bot-linking flow or SMS
    gateway contract needed.

    Email (`channel="email"`, used by password reset + registration codes for
    email identifiers) is delivered via SMTP (`Settings.smtp_*` -- Gmail by
    default: smtp.gmail.com:587 + an App Password) using the stdlib
    `smtplib`/`email.message`.

    `link`, when given (password reset only -- its `code` is a 32-byte
    urlsafe token meant for a URL, not for typing in by hand), makes the
    email body a clickable link instead of a bare code. Registration/OTP
    codes are short and meant to be typed into the app, so they never pass
    `link`.
    """
    logger.info("send_code channel=%s destination=%s code=%s", channel, destination, code)
    # Late import: avoids a notify.py <-> tasks.py circular import at module
    # load time (tasks.py imports the sync senders from this file).
    from app.core.tasks import send_email_code_task, send_sms_code_task

    if channel == "sms":
        task, args = send_sms_code_task, (destination, code)
    elif channel == "email":
        task, args = send_email_code_task, (destination, code, link)
    else:
        return

    # `.delay()` itself does a synchronous, blocking round trip to the broker
    # (opens/reuses a kombu connection to Redis and publishes the message) --
    # calling it directly here would block this coroutine's event loop for
    # that whole round trip, defeating the entire point of moving delivery
    # off the request path. `asyncio.to_thread` keeps it off the loop, same
    # pattern as bcrypt in core/security.py.
    #
    # If the broker is simply unreachable (e.g. local dev with no Redis/
    # Celery worker running -- there's no dev-mode substitute for either,
    # unlike SMTP/Telegram Gateway which log-only when unconfigured), publish
    # raises a kombu/redis connection error. Swallow it here rather than
    # letting it bubble up into the caller's request -- the whole point of
    # this being a background task is that a broker outage degrades delivery,
    # not the login/OTP/registration request itself.
    try:
        await asyncio.to_thread(task.delay, *args)
    except Exception:
        logger.exception(
            "Could not enqueue %s code delivery for %s -- Celery broker unreachable? "
            "Code was only logged above, not delivered.",
            channel,
            destination,
        )


def send_alert(*, channel: str, destination: str, message: str) -> None:
    """Placeholder notifier for non-OTP alerts (billing storage warnings,
    future dunning/expiry notices). Logs instead of delivering -- same
    swap-out point as send_code once a real channel is prioritized."""
    logger.info("send_alert channel=%s destination=%s message=%s", channel, destination, message)
