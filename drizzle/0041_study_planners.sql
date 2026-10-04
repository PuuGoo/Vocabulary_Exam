CREATE TABLE IF NOT EXISTS study_planners (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
