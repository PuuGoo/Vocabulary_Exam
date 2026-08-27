ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "question_type" varchar(16) DEFAULT 'speaking' NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "options" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_questions" ADD COLUMN IF NOT EXISTS "correct_option" varchar(1);
