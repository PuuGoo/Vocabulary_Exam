CREATE TABLE IF NOT EXISTS "set_review_progress" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "set_id" integer NOT NULL REFERENCES "vocab_sets"("id") ON DELETE cascade,
  "stage" integer DEFAULT 1 NOT NULL,
  "initial_completed_at" timestamp with time zone NOT NULL,
  "review_1_completed_at" timestamp with time zone,
  "review_2_completed_at" timestamp with time zone,
  "review_3_completed_at" timestamp with time zone,
  "last_review_at" timestamp with time zone,
  "next_review_at" timestamp with time zone,
  "last_accuracy" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "set_review_progress_user_set_idx" ON "set_review_progress" USING btree ("user_id", "set_id");
CREATE INDEX IF NOT EXISTS "set_review_progress_user_due_idx" ON "set_review_progress" USING btree ("user_id", "next_review_at");

CREATE TABLE IF NOT EXISTS "review_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "idempotency_key" varchar(96) NOT NULL,
  "session_type" varchar(24) NOT NULL,
  "set_id" integer REFERENCES "vocab_sets"("id") ON DELETE set null,
  "set_review_stage" integer,
  "word_count" integer NOT NULL,
  "correct_count" integer NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_sessions_user_key_idx" ON "review_sessions" USING btree ("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "review_sessions_user_completed_idx" ON "review_sessions" USING btree ("user_id", "completed_at");

ALTER TABLE "learning_goals" ADD COLUMN IF NOT EXISTS "daily_review_words" integer DEFAULT 40 NOT NULL;
