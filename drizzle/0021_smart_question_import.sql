CREATE TABLE IF NOT EXISTS "question_import_batches" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" varchar(128) NOT NULL,
  "source_type" varchar(24) NOT NULL,
  "total_items" integer NOT NULL,
  "success_items" integer DEFAULT 0 NOT NULL,
  "review_items" integer DEFAULT 0 NOT NULL,
  "failed_items" integer DEFAULT 0 NOT NULL,
  "status" varchar(24) DEFAULT 'completed' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "undone_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_import_batches_category_idx" ON "question_import_batches" ("category");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_parsing_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "config" text DEFAULT '{}' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_parsing_profiles_owner_name_idx" ON "question_parsing_profiles" ("created_by", "name");
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "correct_options" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "explanation" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "difficulty" varchar(16);
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "tags" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "speaking_part" varchar(16);
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "topic" varchar(256);
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "import_batch_id" integer REFERENCES "question_import_batches"("id") ON DELETE set null;
