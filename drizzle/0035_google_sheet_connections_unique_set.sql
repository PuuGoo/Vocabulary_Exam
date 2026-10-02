-- Additive: guarantee at most one google_sheet_connections row per vocabulary
-- set, so two concurrent creates can never end up with two spreadsheets.
--
-- The create workflow already serializes through an advisory create lock; this
-- index is the database-level backstop (requirement #9/#10).
--
-- Duplicate reconciliation: for a set holding more than one row, the survivor is
-- the healthy one (status='connected' AND enabled), otherwise the most recently
-- updated. Losing rows are *invalid by construction* (a set may only have one
-- integration) and are removed together with their dependent rows through the
-- existing ON DELETE CASCADE, so no word, mapping, progress or history of the
-- surviving connection is touched.

DO $$
DECLARE
  duplicate record;
  winner_id integer;
  loser record;
BEGIN
  FOR duplicate IN
    SELECT set_id FROM google_sheet_connections GROUP BY set_id HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO winner_id
    FROM google_sheet_connections
    WHERE set_id = duplicate.set_id
    ORDER BY
      CASE WHEN status = 'connected' AND enabled THEN 0 ELSE 1 END,
      updated_at DESC,
      id DESC
    LIMIT 1;

    FOR loser IN
      SELECT id, spreadsheet_id FROM google_sheet_connections
      WHERE set_id = duplicate.set_id AND id <> winner_id
    LOOP
      RAISE NOTICE 'Retiring duplicate google_sheet_connections % (set %, spreadsheet %) in favour of %',
        loser.id, duplicate.set_id, loser.spreadsheet_id, winner_id;
    END LOOP;

    DELETE FROM google_sheet_connections
    WHERE set_id = duplicate.set_id AND id <> winner_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS google_sheet_connections_set_unique ON google_sheet_connections(set_id);