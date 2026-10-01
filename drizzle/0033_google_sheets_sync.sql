-- Additive Google Sheets Sync schema (phase 1). No existing tables are altered.
CREATE TABLE IF NOT EXISTS google_sheet_connections (
  id serial PRIMARY KEY,
  set_id integer NOT NULL REFERENCES vocab_sets(id) ON DELETE CASCADE,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  spreadsheet_id varchar(255) NOT NULL,
  spreadsheet_url text NOT NULL,
  spreadsheet_name varchar(512) NOT NULL,
  sheet_id integer NOT NULL,
  sheet_title varchar(255) NOT NULL,
  range_a1 varchar(255) NOT NULL,
  template_type varchar(64) NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  sync_direction varchar(32) NOT NULL DEFAULT 'google_to_lexora',
  delete_behavior varchar(16) NOT NULL DEFAULT 'archive',
  enabled boolean NOT NULL DEFAULT true,
  status varchar(16) NOT NULL DEFAULT 'connected',
  last_synced_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_sheet_connections_set_idx ON google_sheet_connections(set_id);
CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_connections_spreadsheet_idx ON google_sheet_connections(spreadsheet_id);

CREATE TABLE IF NOT EXISTS google_sheet_sync_channels (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES google_sheet_connections(id) ON DELETE CASCADE,
  channel_id varchar(255) NOT NULL,
  resource_id varchar(255) NOT NULL,
  resource_uri text NOT NULL,
  expiration_at timestamptz,
  last_message_number bigint,
  status varchar(16) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_sheet_sync_channels_connection_idx ON google_sheet_sync_channels(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_sync_channels_channel_idx ON google_sheet_sync_channels(channel_id);

CREATE TABLE IF NOT EXISTS google_sheet_row_mappings (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES google_sheet_connections(id) ON DELETE CASCADE,
  word_id integer REFERENCES words(id) ON DELETE CASCADE,
  source_id varchar(64) NOT NULL,
  sheet_row_number integer NOT NULL,
  source_fingerprint varchar(128),
  last_synced_fingerprint varchar(128),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_row_mappings_source_idx ON google_sheet_row_mappings(connection_id, source_id);
CREATE INDEX IF NOT EXISTS google_sheet_row_mappings_connection_row_idx ON google_sheet_row_mappings(connection_id, sheet_row_number);
CREATE INDEX IF NOT EXISTS google_sheet_row_mappings_word_idx ON google_sheet_row_mappings(word_id);

CREATE TABLE IF NOT EXISTS google_sheet_sync_runs (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES google_sheet_connections(id) ON DELETE CASCADE,
  trigger_type varchar(32) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'running',
  rows_read integer NOT NULL DEFAULT 0,
  rows_created integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_deleted integer NOT NULL DEFAULT 0,
  rows_unchanged integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  validation_error_count integer NOT NULL DEFAULT 0,
  error_message text,
  metadata text NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS google_sheet_sync_runs_connection_idx ON google_sheet_sync_runs(connection_id, started_at);

-- Webhook + cron synchronization uses database-backed pending state and a
-- connection-level lock (no Redis/BullMQ dependency).
CREATE TABLE IF NOT EXISTS google_sheet_sync_locks (
  connection_id integer PRIMARY KEY REFERENCES google_sheet_connections(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL,
  locked_until timestamptz NOT NULL,
  locked_by varchar(64) NOT NULL
);
CREATE TABLE IF NOT EXISTS google_sheet_sync_pending (
  connection_id integer PRIMARY KEY REFERENCES google_sheet_connections(id) ON DELETE CASCADE,
  pending boolean NOT NULL DEFAULT false,
  pending_reason varchar(64),
  pending_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Google OAuth tokens are encrypted at rest (AES-256-GCM). Refresh tokens are
-- never returned to the browser and never written to logs.
CREATE TABLE IF NOT EXISTS google_sheet_oauth_tokens (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope varchar(512) NOT NULL,
  token_type varchar(32) NOT NULL DEFAULT 'Bearer',
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_oauth_tokens_user_idx ON google_sheet_oauth_tokens(user_id);
