CREATE TABLE IF NOT EXISTS "quiz_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"set_id" integer,
	"mode" varchar(16) NOT NULL,
	"timed" boolean DEFAULT false NOT NULL,
	"timed_minutes" integer,
	"retest" boolean DEFAULT false NOT NULL,
	"range_from" integer,
	"range_to" integer,
	"group_index" integer DEFAULT 0 NOT NULL,
	"answers" text DEFAULT '{}' NOT NULL,
	"mc_options" text DEFAULT '{}' NOT NULL,
	"checked_groups" text DEFAULT '{}' NOT NULL,
	"retry_word_ids_by_group" text DEFAULT '{}' NOT NULL,
	"hint_ids" text DEFAULT '[]' NOT NULL,
	"word_ids" text DEFAULT '[]' NOT NULL,
	"elapsed" integer DEFAULT 0 NOT NULL,
	"timed_ends_at" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_progress" ADD CONSTRAINT "quiz_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_progress" ADD CONSTRAINT "quiz_progress_set_id_vocab_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."vocab_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_progress_user_set_idx" ON "quiz_progress" USING btree ("user_id","set_id","mode","timed","timed_minutes","retest","range_from","range_to");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_progress_user_idx" ON "quiz_progress" USING btree ("user_id");
