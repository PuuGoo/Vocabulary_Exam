CREATE TABLE IF NOT EXISTS "teach_back_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"word_id" integer NOT NULL,
	"simple_explanation" text NOT NULL,
	"own_example" text,
	"confidence" integer DEFAULT 1 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teach_back_notes" ADD CONSTRAINT "teach_back_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teach_back_notes" ADD CONSTRAINT "teach_back_notes_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teach_back_notes_user_word_idx" ON "teach_back_notes" USING btree ("user_id","word_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teach_back_notes_user_due_idx" ON "teach_back_notes" USING btree ("user_id","next_review_at");