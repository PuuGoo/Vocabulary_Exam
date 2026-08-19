CREATE TABLE IF NOT EXISTS "writing_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" varchar(256) NOT NULL,
	"scores" text DEFAULT '{}' NOT NULL,
	"attempts" text DEFAULT '{}' NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"elapsed" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "writing_progress" ADD CONSTRAINT "writing_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "writing_progress_user_category_idx" ON "writing_progress" USING btree ("user_id","category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "writing_progress_user_idx" ON "writing_progress" USING btree ("user_id");