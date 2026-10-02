-- Additive: advisory lock table for the create-sheet workflow.
--
-- It must NOT live in google_sheet_sync_locks: that table's connection_id
-- references google_sheet_connections(id), which does not exist yet while the
-- spreadsheet is being created (the spreadsheet is created first, the connection
-- row second). Reusing that table made every first-time create fail with
-- "violates foreign key constraint google_sheet_sync_locks_connection_id_fkey".
--
-- Keyed by set_id: one create at a time per vocabulary set. Stale rows expire by
-- locked_until, so a crashed process cannot block creates forever.
CREATE TABLE IF NOT EXISTS google_sheet_create_locks (
  set_id integer PRIMARY KEY,
  locked_at timestamptz NOT NULL,
  locked_until timestamptz NOT NULL,
  locked_by varchar(64) NOT NULL
);

-- Clear any rows left behind by the failed implementation before it existed.
DELETE FROM google_sheet_create_locks WHERE locked_until < now();