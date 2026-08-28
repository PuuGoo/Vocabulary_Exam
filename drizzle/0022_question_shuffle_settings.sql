ALTER TABLE "vocab_categories" ADD COLUMN IF NOT EXISTS "shuffle_questions" boolean DEFAULT false NOT NULL;
ALTER TABLE "vocab_categories" ADD COLUMN IF NOT EXISTS "shuffle_options" boolean DEFAULT false NOT NULL;
ALTER TABLE "vocab_categories" ADD COLUMN IF NOT EXISTS "shuffle_mode" varchar(16) DEFAULT 'random' NOT NULL;
