import asyncio
import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from app.core.config import Settings, get_settings

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
    """OTP / password-reset code delivery.

    SMS (`channel="sms"`, used by phone OTP) is actually delivered via
    Telegram's official Gateway API (`Settings.telegram_gateway_api_token`,
    https://core.telegram.org/gateway) rather than a real SMS provider --
    it sends the code as a Telegram message to whichever Telegram account is
    registered under that phone number, no per-user bot-linking flow or SMS
    gateway contract needed. Plain `urllib.request` + `asyncio.to_thread`,
    same pattern as `notifications/telegram.py` (no async HTTP client
    dependency in this repo). Delivery failure is logged, never raised: OTP
    request endpoints always return 204 regardless of match (account-
    enumeration protection), and the code is already stored/hashed in the DB
    either way -- same best-effort, non-fatal shape as calls' recording
    download.

    Email (`channel="email"`, used by password reset + registration codes for
    email identifiers) is delivered via SMTP (`Settings.smtp_*` -- Gmail by
    default: smtp.gmail.com:587 + an App Password) using the stdlib
    `smtplib`/`email.message`, blocking-call-in-a-thread same as bcrypt/
    Telegram above. Same non-fatal, log-only-if-unconfigured shape.

    `link`, when given (password reset only -- its `code` is a 32-byte
    urlsafe token meant for a URL, not for typing in by hand), makes the
    email body a clickable link instead of a bare code. Registration/OTP
    codes are short and meant to be typed into the app, so they never pass
    `link`.
    """
    logger.info("send_code channel=%s destination=%s code=%s", channel, destination, code)
    settings = get_settings()

    if channel == "sms":
        if not settings.telegram_gateway_api_token:
            logger.warning(
                "Telegram Gateway not configured (telegram_gateway_api_token empty) -- code only logged, not delivered"
            )
            return
        try:
            await asyncio.to_thread(
                _send_via_telegram_gateway_sync, settings.telegram_gateway_api_token, destination, code
            )
        except Exception:
            logger.error("Telegram Gateway delivery failed", exc_info=True)
        return

    if channel == "email":
        if not settings.smtp_username or not settings.smtp_password or not settings.smtp_sender_email:
            logger.warning("SMTP not configured (smtp_username/smtp_password/smtp_sender_email empty) -- code only logged, not delivered")
            return
        try:
            await asyncio.to_thread(_send_via_smtp_sync, settings, destination, code, link)
        except Exception:
            logger.error("SMTP delivery failed", exc_info=True)
        return


def send_alert(*, channel: str, destination: str, message: str) -> None:
    """Placeholder notifier for non-OTP alerts (billing storage warnings,
    future dunning/expiry notices). Logs instead of delivering -- same
    swap-out point as send_code once a real channel is prioritized."""
    logger.info("send_alert channel=%s destination=%s message=%s", channel, destination, message)
