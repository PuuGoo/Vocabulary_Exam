ALTER TABLE "word_progress" ADD COLUMN "interval_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "word_progress" ADD COLUMN "review_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "word_progress" ADD COLUMN "correct_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "word_progress" ADD COLUMN "wrong_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "word_progress" ADD COLUMN "last_mode" varchar(24);--> statement-breakpoint
ALTER TABLE "word_progress" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "word_progress" ADD COLUMN "next_review_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "word_progress_user_due_idx" ON "word_progress" USING btree ("user_id","next_review_at");