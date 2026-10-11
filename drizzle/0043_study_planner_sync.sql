-- 0043 Study Planner Sync — normalized planner model (Phase 3)
--
-- Additive and idempotent. Nothing is dropped or truncated, and the existing
-- study_planners user -> spreadsheet rows are preserved: they are backfilled
-- into study_planner_connections, which becomes the connection of record for
-- synchronization. study_planners stays in place so existing personal copies
-- are never silently replaced, deleted, or relinked to another spreadsheet.
--
-- Domain isolation (spec 1.2): every table is prefixed study_planner_* and none
-- of them references a vocabulary table, so vocabulary synchronization is
-- untouched by this feature.

-- ---------------------------------------------------------------- connection
CREATE TABLE IF NOT EXISTS study_planner_connections (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL DEFAULT '',
  spreadsheet_name text NOT NULL DEFAULT '',
  template_id text NOT NULL DEFAULT '',
  template_version integer NOT NULL DEFAULT 1,
  status varchar(16) NOT NULL DEFAULT 'connected',
  enabled boolean NOT NULL DEFAULT true,
  managed_by_lexora boolean NOT NULL DEFAULT false,
  external_state varchar(24) NOT NULL DEFAULT 'unknown',
  last_verified_at timestamptz,
  last_synced_at timestamptz,
  last_successful_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (spreadsheet_id)
);

-- Preserve every existing personal copy: one connection per legacy planner row.
INSERT INTO study_planner_connections (user_id, spreadsheet_id, spreadsheet_url, spreadsheet_name, managed_by_lexora)
SELECT
  sp.user_id,
  sp.spreadsheet_id,
  'https://docs.google.com/spreadsheets/d/' || sp.spreadsheet_id || '/edit',
  'Study Planner',
  true
FROM study_planners sp
ON CONFLICT (user_id) DO NOTHING;

-- ------------------------------------------------------ sync infrastructure
CREATE TABLE IF NOT EXISTS study_planner_sync_channels (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  channel_id varchar(255) NOT NULL,
  resource_id varchar(255) NOT NULL,
  resource_uri text NOT NULL DEFAULT '',
  expiration_at timestamptz,
  -- SHA-256 digest only; the raw channel token is never stored or logged.
  channel_token_hash varchar(128),
  last_message_number bigint,
  status varchar(16) NOT NULL DEFAULT 'active',
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id)
);
CREATE INDEX IF NOT EXISTS study_planner_sync_channels_conn_idx ON study_planner_sync_channels(connection_id);

CREATE TABLE IF NOT EXISTS study_planner_sync_pending (
  connection_id integer PRIMARY KEY REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  pending boolean NOT NULL DEFAULT false,
  pending_reason varchar(64),
  pending_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_planner_sync_runs (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  trigger_type varchar(32) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'running',
  rows_read integer NOT NULL DEFAULT 0,
  rows_created integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_unchanged integer NOT NULL DEFAULT 0,
  rows_deleted integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  error_message text,
  metadata text NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS study_planner_sync_runs_conn_idx ON study_planner_sync_runs(connection_id, started_at);

CREATE TABLE IF NOT EXISTS study_planner_sync_locks (
  connection_id integer PRIMARY KEY REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL,
  locked_until timestamptz NOT NULL,
  locked_by varchar(64) NOT NULL
);

-- Monotonic revision per connection. The UI polls this; it never triggers sync.
CREATE TABLE IF NOT EXISTS study_planner_sync_revisions (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  reason varchar(64) NOT NULL DEFAULT 'sync',
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, revision)
);

-- Outbound web -> Sheet writes. Only mapped input ranges are ever queued.
CREATE TABLE IF NOT EXISTS study_planner_write_queue (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  range_a1 varchar(255) NOT NULL,
  values_json text NOT NULL,
  expected_fingerprint varchar(128),
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_planner_write_queue_pending_idx ON study_planner_write_queue(connection_id, status);

-- Editable control cells from view-oriented tabs (semester dates, target band,
-- selected day/month). Stored because the web drives them too.
CREATE TABLE IF NOT EXISTS study_planner_settings (
  connection_id integer PRIMARY KEY REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  semester_start date,
  semester_end date,
  semester_weeks integer,
  target_ielts text,
  selected_date date,
  selected_year integer,
  selected_month integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rollback / bulk-review snapshots (Phase 9). Never auto-applied.
CREATE TABLE IF NOT EXISTS study_planner_snapshots (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  payload_json text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_planner_snapshots_conn_idx ON study_planner_snapshots(connection_id, created_at DESC);

-- ------------------------------------------------------------ domain: courses
-- Thông tin lớp học: course rows (A7:E) and the weekly schedule block (G:L).
CREATE TABLE IF NOT EXISTS study_planner_courses (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  course_name text NOT NULL,
  course_code text,
  lecturer text,
  credits integer,
  notes text,
  score numeric,
  grade_point numeric,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_courses_conn_idx ON study_planner_courses(connection_id);

CREATE TABLE IF NOT EXISTS study_planner_course_sessions (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  course_id integer NOT NULL REFERENCES study_planner_courses(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  weekday smallint NOT NULL,
  start_time double precision NOT NULL,
  end_time double precision NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_course_sessions_course_idx ON study_planner_course_sessions(course_id);

-- --------------------------------------------- domain: tasks + IELTS practice
-- Nhật ký nhiệm vụ is the single source for daily tasks. IELTS practice from
-- 'Kế hoạch ngày & IELTS' shares this table through the ielts_* columns so a
-- task is never imported twice.
CREATE TABLE IF NOT EXISTS study_planner_tasks (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  task_date date NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  start_time double precision,
  end_time double precision,
  category text,
  ielts_skill text,
  task_title text NOT NULL,
  priority text,
  duration_minutes integer,
  notes text,
  due_date date,
  compensating_task text,
  status_text text,
  -- IELTS practice fields (workbook columns I:M on the daily/IELTS tab).
  ielts_material text,
  ielts_task_type text,
  ielts_band numeric,
  ielts_mistake_analysis text,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_tasks_conn_date_idx ON study_planner_tasks(connection_id, task_date);

-- ------------------------------------------------------------ domain: topics
CREATE TABLE IF NOT EXISTS study_planner_curriculum_topics (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  subject text NOT NULL,
  topic text NOT NULL,
  expected_week integer,
  status_text text,
  completed boolean NOT NULL DEFAULT false,
  notes text,
  position integer NOT NULL DEFAULT 0,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_curriculum_conn_idx ON study_planner_curriculum_topics(connection_id);

-- --------------------------------------------------------- domain: deadlines
CREATE TABLE IF NOT EXISTS study_planner_assignments (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  subject text,
  description text NOT NULL,
  category text,
  status_text text,
  duration_hours numeric,
  due_time double precision,
  due_date date,
  notes text,
  grade text,
  position integer NOT NULL DEFAULT 0,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_assignments_due_idx ON study_planner_assignments(connection_id, due_date);

-- ----------------------------------------------------------- domain: reading
CREATE TABLE IF NOT EXISTS study_planner_reading_materials (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  subject text,
  title text NOT NULL,
  author text,
  target_pages text,
  current_page integer,
  total_pages integer,
  notes text,
  position integer NOT NULL DEFAULT 0,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_reading_conn_idx ON study_planner_reading_materials(connection_id);

-- --------------------------------------------------------- domain: attendance
-- Identity is (session + course), never the sheet column, so inserting a
-- session column does not rewrite attendance history.
CREATE TABLE IF NOT EXISTS study_planner_attendance_sessions (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  session_index integer NOT NULL,
  session_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);

CREATE TABLE IF NOT EXISTS study_planner_attendance_marks (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  session_id integer NOT NULL REFERENCES study_planner_attendance_sessions(id) ON DELETE CASCADE,
  course_id integer REFERENCES study_planner_courses(id) ON DELETE SET NULL,
  course_name text NOT NULL,
  mark varchar(8) NOT NULL,
  sheet_row integer,
  sheet_column text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, course_name)
);
CREATE INDEX IF NOT EXISTS study_planner_attendance_marks_conn_idx ON study_planner_attendance_marks(connection_id);

-- -------------------------------------------------------------- domain: habits
CREATE TABLE IF NOT EXISTS study_planner_habits (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_habits_conn_idx ON study_planner_habits(connection_id);

-- Keyed by stable habit + real calendar date, never by grid position.
CREATE TABLE IF NOT EXISTS study_planner_habit_completions (
  id serial PRIMARY KEY,
  habit_id integer NOT NULL REFERENCES study_planner_habits(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, completion_date)
);
CREATE INDEX IF NOT EXISTS study_planner_habit_completions_date_idx ON study_planner_habit_completions(completion_date);

-- -------------------------------------------------------------- domain: todos
CREATE TABLE IF NOT EXISTS study_planner_todos (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  task_title text NOT NULL,
  category text,
  priority text,
  due_date date,
  notes text,
  position integer NOT NULL DEFAULT 0,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_todos_conn_idx ON study_planner_todos(connection_id);

-- ---------------------------------------------------------- domain: activities
CREATE TABLE IF NOT EXISTS study_planner_activities (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  lexora_id varchar(64) NOT NULL,
  activity_date date NOT NULL,
  start_time double precision,
  end_time double precision,
  activity_name text NOT NULL,
  activity_type text,
  notes text,
  position integer NOT NULL DEFAULT 0,
  sheet_row integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, lexora_id)
);
CREATE INDEX IF NOT EXISTS study_planner_activities_date_idx ON study_planner_activities(connection_id, activity_date);

-- ---------------------------------------------------------- conflicts / audit
-- Both sides are preserved; resolution requires explicit user action.
CREATE TABLE IF NOT EXISTS study_planner_conflicts (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  entity_type varchar(32) NOT NULL,
  entity_id integer NOT NULL,
  field_key varchar(64) NOT NULL,
  sheet_value text,
  web_value text,
  resolved_at timestamptz,
  resolved_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_planner_conflicts_conn_idx ON study_planner_conflicts(connection_id, resolved_at);

-- Bulk destructive changes wait here until a person approves them.
CREATE TABLE IF NOT EXISTS study_planner_bulk_reviews (
  id serial PRIMARY KEY,
  connection_id integer NOT NULL REFERENCES study_planner_connections(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  fingerprint varchar(128) NOT NULL,
  summary_json text NOT NULL DEFAULT '{}',
  snapshot_id integer REFERENCES study_planner_snapshots(id) ON DELETE SET NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS study_planner_bulk_reviews_conn_idx ON study_planner_bulk_reviews(connection_id, status);
