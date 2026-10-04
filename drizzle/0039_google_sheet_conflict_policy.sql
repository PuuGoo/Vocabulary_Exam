ALTER TABLE google_sheet_connections ADD COLUMN IF NOT EXISTS conflict_policy varchar(16) NOT NULL DEFAULT 'review';
