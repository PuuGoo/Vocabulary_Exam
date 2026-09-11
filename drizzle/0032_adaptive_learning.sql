CREATE TABLE IF NOT EXISTS word_senses (
  id serial PRIMARY KEY,
  word_id integer NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  position integer NOT NULL,
  pronunciation text,
  meaning text NOT NULL,
  example text,
  example_pronunciation text,
  example_meaning text,
  wtype varchar(32),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT word_senses_position_positive CHECK (position >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS word_senses_word_position_idx ON word_senses(word_id, position);
CREATE INDEX IF NOT EXISTS word_senses_word_idx ON word_senses(word_id);

CREATE TABLE IF NOT EXISTS user_word_skill_progress (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id integer NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  skill varchar(48) NOT NULL,
  mastery_score integer NOT NULL CHECK (mastery_score BETWEEN 0 AND 100),
  practice_count integer NOT NULL DEFAULT 0 CHECK (practice_count >= 0),
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_result varchar(24) NOT NULL,
  last_practiced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_word_skill_progress_skill_check CHECK (skill IN ('meaning_recognition','orthography_recognition','orthography_production','pronunciation_recall','tone_accuracy','listening_recognition','speaking'))
);
CREATE UNIQUE INDEX IF NOT EXISTS user_word_skill_progress_user_word_skill_idx ON user_word_skill_progress(user_id, word_id, skill);
CREATE INDEX IF NOT EXISTS user_word_skill_progress_user_idx ON user_word_skill_progress(user_id);
CREATE INDEX IF NOT EXISTS user_word_skill_progress_word_idx ON user_word_skill_progress(word_id);
CREATE INDEX IF NOT EXISTS user_word_skill_progress_user_skill_idx ON user_word_skill_progress(user_id, skill);

CREATE TABLE IF NOT EXISTS user_word_skill_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id integer NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  event_key varchar(128) NOT NULL,
  skill varchar(48) NOT NULL,
  result_quality integer NOT NULL CHECK (result_quality BETWEEN 0 AND 100),
  source_mode varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_word_skill_events_user_key_idx ON user_word_skill_events(user_id, event_key);
CREATE INDEX IF NOT EXISTS user_word_skill_events_user_word_idx ON user_word_skill_events(user_id, word_id);
