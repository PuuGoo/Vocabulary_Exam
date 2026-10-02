-- Additive: store a hash of the Google Drive push-notification channel token.
-- Existing channels have no token and are treated as legacy until the watch
-- channel is recreated (which the renewal cron / reconcile does automatically).
ALTER TABLE google_sheet_sync_channels ADD COLUMN IF NOT EXISTS channel_token_hash varchar(128);
