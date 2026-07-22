-- Client requirement (2026-07-13): the daily seller-summary schedule needs
-- to target one specific already-connected group (not always the tenant's
-- default), and optionally only a subset of sellers/managers (not
-- necessarily everyone).
ALTER TABLE notification_daily_schedules ADD COLUMN group_mapping_id UUID REFERENCES telegram_group_mappings(id);
ALTER TABLE notification_daily_schedules ADD COLUMN user_ids UUID[];
