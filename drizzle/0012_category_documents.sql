CREATE TABLE IF NOT EXISTS "category_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"file_name" varchar(256) NOT NULL,
	"file_type" varchar(128) DEFAULT 'application/pdf' NOT NULL,
	"file_size" integer NOT NULL,
	"file_data" "bytea" NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_documents" ADD CONSTRAINT "category_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_documents_category_idx" ON "category_documents" USING btree ("category");
