"""Celery app -- originally OTP/code delivery only (2026-07-12, a deliberate
exception to the rest of this repo's "dedicated table + asyncio.create_task
worker" background-work convention: payroll_worker.py, export_worker.py, CRM
worker.py all still use that). Extended 2026-07-14 to also carry the entire
Telegram notification pipeline (outbox delivery, schedule dispatch, group-link
polling -- see app/modules/notifications/tasks.py), per explicit user request
to move that specific module onto Celery + Beat. CRM/finance/reports keep
their asyncio workers untouched. Runs as its own OS process
(dashboarduz-celery.service / dashboarduz-celery-beat.service), not inside the
FastAPI event loop.
"""

from celery import Celery

from app.core.config import get_settings

celery_app = Celery("dashboarduz", broker=get_settings().celery_broker_url)
celery_app.conf.update(task_ignore_result=True, broker_connection_retry_on_startup=True)
# tasks modules import celery_app from this module, so they must be
# discovered after celery_app exists -- autodiscover_tasks() imports
# app.core.tasks / app.modules.notifications.tasks for us instead of a manual
# import here (which would be circular). force=True is required -- without
# it, autodiscover_tasks defers discovery to a signal hook that never fires
# for a plain worker-process import (caught the hard way for the OTP tasks
# originally; would silently recur here too without it).
celery_app.autodiscover_tasks(["app.core", "app.modules.notifications"], force=True)

_settings = get_settings()
celery_app.conf.beat_schedule = {
    "notifications-dispatch-outbox": {
        "task": "notifications.dispatch_due_outbox",
        "schedule": float(_settings.notification_worker_poll_seconds),
    },
    "notifications-dispatch-schedules": {
        "task": "notifications.dispatch_due_schedules",
        "schedule": 60.0,
    },
    "notifications-poll-group-links": {
        "task": "notifications.poll_group_links",
        "schedule": float(_settings.telegram_link_worker_poll_seconds),
    },
}
