-- Migration 0042: carry the archive flag of retired Google Sheets connections
--
-- What it does
-- ------------
-- The app-layer fix retires a terminal connection (status='archived' /
-- 'replaced') on demand through recreateFreshSheetForSet(): copy the archived
-- word ids into vocabulary_archive_marks, delete the dead row, then create a
-- fresh Sheet. This migration is the DATA-LEVEL equivalent for rows already
-- sitting terminal in production, so the archived-word visibility is
-- preserved no matter which path retires the connection.
--
-- Safety: additive + idempotent, no DROP TABLE / DROP COLUMN.
--
-- 1) Preserve the visibility outcome: google_sheet_row_mappings.deleted_at
--    is the archive flag that hides a word from the set detail. Deleting
--    the connection would cascade-delete those mappings, making every
--    previously archived word reappear. So before any delete, copy each
--    archived word_id into vocabulary_archive_marks (one row per word,
--    never touching the words row itself or its progress/mistakes).
--
-- 2) Retire exactly the orphaned terminal rows: status IN ('archived',
--    'replaced'), no sibling connection for the same set, and no active
--    channel. A row that still has an active channel is left untouched: the
--    webhook / replace wiring may still own it. The cascade then removes
--    google_sheet_sync_channels / _locks / _pending / _resources /
--    _row_mappings / _runs, but never the words, progress or mistakes.
--
-- 3) Drop marks whose word no longer belongs to the marked set (defensive).
--
-- Run manually:
--   psql $DATABASE_URL -f drizzle/0042_google_sheet_terminal_connections.sql
-- or
--   npm run db:migrate:google-sheets
-- and verify:
--   SELECT set_id, status FROM google_sheet_connections WHERE status IN ('archived','replaced');
-- (should stay 0 for orphans without an active channel).

CREATE TABLE IF NOT EXISTS vocabulary_archive_marks (
  word_id integer PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  set_id integer NOT NULL REFERENCES vocab_sets(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_from_connection integer REFERENCES google_sheet_connections(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'terminal_google_sheet_connection'
);

-- 1) Carry archived words carried by the rows we are about to retire.
-- One row per word, regardless of how many mappings covered it.
INSERT INTO vocabulary_archive_marks (word_id, set_id, archived_from_connection, archived_at, reason)
SELECT DISTINCT
  m.word_id,
  c.set_id,
  c.id AS archived_from_connection,
  now() AS archived_at,
  'terminal_google_sheet_connection' AS reason
FROM google_sheet_connections c
JOIN google_sheet_row_mappings m ON m.connection_id = c.id
WHERE c.status IN ('archived', 'replaced')
  AND m.word_id IS NOT NULL
  AND m.deleted_at IS NOT NULL
  AND NOT EXISTS (
    -- The set has no surviving connection to keep the mapping alive.
    SELECT 1 FROM google_sheet_connections c2
    WHERE c2.set_id = c.set_id AND c2.id <> c.id
  )
  AND NOT EXISTS (
    -- The row is truly orphaned: its channel is not still active.
    SELECT 1 FROM google_sheet_sync_channels ch
    WHERE ch.connection_id = c.id AND ch.status = 'active'
  )
ON CONFLICT (word_id) DO NOTHING;

-- 2) Remove the orphaned terminal connections. The archive marks above survive
-- ON DELETE SET NULL so they do not prevent this delete, and they keep the
-- write scope vocabulary-safe (words / progress / mistakes are never touched).
DELETE FROM google_sheet_connections c
WHERE c.status IN ('archived', 'replaced')
  AND NOT EXISTS (
    SELECT 1 FROM google_sheet_connections c2
    WHERE c2.set_id = c.set_id AND c2.id <> c.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM google_sheet_sync_channels ch
    WHERE ch.connection_id = c.id AND ch.status = 'active'
  );

-- 3) Keep only marks that actually protect a once-archived vocabulary word
-- that has no surviving Google Sheets connection; drop the rest so the table
-- does not accumulate noise. (Re-running the migration after a successful
-- create → new mapping will re-insert fresh marks as needed.)
DELETE FROM vocabulary_archive_marks am
WHERE NOT EXISTS (
  SELECT 1 FROM words w WHERE w.id = am.word_id AND w.set_id = am.set_id
);
