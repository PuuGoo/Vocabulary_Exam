-- Vocabulary depth: optional word metadata, collocations, patterns, topics,
-- word families, structured pronunciation variants and per-skill mastery.
-- Everything is additive and idempotent so existing data and old backups stay valid.

ALTER TABLE "words"
  ADD COLUMN IF NOT EXISTS "content_kind" varchar(24) DEFAULT 'word' NOT NULL,
  ADD COLUMN IF NOT EXISTS "content_status" varchar(16) DEFAULT 'approved' NOT NULL,
  ADD COLUMN IF NOT EXISTS "register" varchar(24),
  ADD COLUMN IF NOT EXISTS "cefr_level" varchar(8),
  ADD COLUMN IF NOT EXISTS "frequency" varchar(24),
  ADD COLUMN IF NOT EXISTS "ielts_relevant" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "ielts_band_relevance" varchar(16),
  ADD COLUMN IF NOT EXISTS "ielts_skills" text DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "usage_context" text DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "mistakes" ADD COLUMN IF NOT EXISTS "last_reason" varchar(32);

ALTER TABLE "review_sessions"
  ADD COLUMN IF NOT EXISTS "mode" varchar(24),
  ADD COLUMN IF NOT EXISTS "skill" varchar(32);

CREATE TABLE IF NOT EXISTS "word_collocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE cascade,
  "phrase" text NOT NULL,
  "meaning" text,
  "example" text,
  "register" varchar(24),
  "content_status" varchar(16) DEFAULT 'approved' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "word_collocations_word_idx" ON "word_collocations" USING btree ("word_id");
CREATE UNIQUE INDEX IF NOT EXISTS "word_collocations_word_phrase_idx" ON "word_collocations" USING btree ("word_id", "phrase");

CREATE TABLE IF NOT EXISTS "word_patterns" (
  "id" serial PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE cascade,
  "pattern" text NOT NULL,
  "meaning" text,
  "example" text,
  "content_status" varchar(16) DEFAULT 'approved' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "word_patterns_word_idx" ON "word_patterns" USING btree ("word_id");
CREATE UNIQUE INDEX IF NOT EXISTS "word_patterns_word_pattern_idx" ON "word_patterns" USING btree ("word_id", "pattern");

CREATE TABLE IF NOT EXISTS "topics" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "topics_name_idx" ON "topics" USING btree ("name");

CREATE TABLE IF NOT EXISTS "word_topics" (
  "id" serial PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE cascade,
  "topic_id" integer NOT NULL REFERENCES "topics"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "word_topics_word_topic_idx" ON "word_topics" USING btree ("word_id", "topic_id");
CREATE INDEX IF NOT EXISTS "word_topics_topic_idx" ON "word_topics" USING btree ("topic_id");

CREATE TABLE IF NOT EXISTS "word_families" (
  "id" serial PRIMARY KEY NOT NULL,
  "label" varchar(128) NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "word_families_label_idx" ON "word_families" USING btree ("label");

CREATE TABLE IF NOT EXISTS "word_family_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "family_id" integer NOT NULL REFERENCES "word_families"("id") ON DELETE cascade,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE cascade,
  "relation" varchar(32),
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "word_family_members_family_word_idx" ON "word_family_members" USING btree ("family_id", "word_id");
CREATE INDEX IF NOT EXISTS "word_family_members_word_idx" ON "word_family_members" USING btree ("word_id");

CREATE TABLE IF NOT EXISTS "word_pronunciations" (
  "id" serial PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE cascade,
  "ipa" varchar(128) NOT NULL,
  "part_of_speech" varchar(32),
  "sense" text,
  "locale" varchar(16) DEFAULT 'en-GB' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "word_pronunciations_word_idx" ON "word_pronunciations" USING btree ("word_id");

CREATE TABLE IF NOT EXISTS "word_skill_progress" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "word_id" integer NOT NULL REFERENCES "words"("id") ON DELETE cascade,
  "skill" varchar(32) NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "correct_count" integer DEFAULT 0 NOT NULL,
  "assisted_count" integer DEFAULT 0 NOT NULL,
  "streak" integer DEFAULT 0 NOT NULL,
  "mastery" integer,
  "last_mode" varchar(32),
  "last_result" boolean,
  "last_practiced_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "word_skill_progress_user_word_skill_idx" ON "word_skill_progress" USING btree ("user_id", "word_id", "skill");
CREATE INDEX IF NOT EXISTS "word_skill_progress_user_skill_idx" ON "word_skill_progress" USING btree ("user_id", "skill");
CREATE INDEX IF NOT EXISTS "word_skill_progress_user_mastery_idx" ON "word_skill_progress" USING btree ("user_id", "mastery");
