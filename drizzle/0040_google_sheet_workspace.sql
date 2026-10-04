ALTER TABLE google_sheet_connections
  ADD COLUMN IF NOT EXISTS managed_by_lexora boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_state varchar(24) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS external_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS google_sheet_resources (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES google_sheet_connections(id) ON DELETE CASCADE,
  spreadsheet_id varchar(255) NOT NULL,
  spreadsheet_url text NOT NULL,
  spreadsheet_name varchar(512) NOT NULL,
  sheet_id integer NOT NULL,
  sheet_title varchar(255) NOT NULL,
  managed_by_lexora boolean NOT NULL DEFAULT false,
  status varchar(24) NOT NULL DEFAULT 'preparing',
  channel_id varchar(255),
  resource_id varchar(255),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_resources_file_idx ON google_sheet_resources(spreadsheet_id);

ALTER TABLE google_sheet_sync_channels
  ALTER COLUMN last_message_number TYPE bigint;
