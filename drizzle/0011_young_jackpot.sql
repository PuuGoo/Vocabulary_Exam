CREATE TABLE IF NOT EXISTS "vocab_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocab_categories" ADD CONSTRAINT "vocab_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_categories_name_idx" ON "vocab_categories" USING btree ("name");--> statement-breakpoint
INSERT INTO "vocab_categories" ("name")
SELECT DISTINCT btrim("category")
FROM "vocab_sets"
WHERE "category" IS NOT NULL AND btrim("category") <> ''
ON CONFLICT ("name") DO NOTHING;
