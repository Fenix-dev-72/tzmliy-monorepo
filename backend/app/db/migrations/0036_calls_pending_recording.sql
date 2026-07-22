-- optimize.md #10: calls/service.py's ingest_webhook used to download the
-- recording and upload it to object storage inline, inside the webhook
-- request itself -- a slow/unresponsive provider recording endpoint directly
-- slowed down webhook processing. Moves that to a background worker
-- (calls/recording_worker.py): the webhook now just records the URL to fetch
-- later, same "dedicated column/table + asyncio.create_task worker"
-- convention as payroll/export/CRM.
ALTER TABLE calls ADD COLUMN pending_recording_url TEXT;
ALTER TABLE calls ADD COLUMN recording_download_attempts INT NOT NULL DEFAULT 0;
