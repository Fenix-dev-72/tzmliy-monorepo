-- Multi-worker-safe claiming for the recording download worker (2026-07-14).
-- recording_worker.py used to SELECT pending rows then process them with no
-- claim step at all -- with more than one app process (uvicorn --workers,
-- multiple VPS), two workers could grab and re-download/re-upload the same
-- recording. recording_claimed_at lets a claim query mark rows atomically
-- (FOR UPDATE SKIP LOCKED) and expire stale claims if a worker crashes
-- mid-download instead of leaving a row stuck forever.
ALTER TABLE calls ADD COLUMN recording_claimed_at TIMESTAMPTZ;
