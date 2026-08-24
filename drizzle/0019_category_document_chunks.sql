CREATE TABLE IF NOT EXISTS "category_document_uploads" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"category" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"file_name" varchar(256) NOT NULL,
	"file_type" varchar(128) NOT NULL,
	"file_size" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"target_document_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_document_upload_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" varchar(64) NOT NULL,
	"chunk_index" integer NOT NULL,
	"file_data" bytea NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_document_uploads" ADD CONSTRAINT "category_document_uploads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_document_uploads" ADD CONSTRAINT "category_document_uploads_target_document_id_category_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."category_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_document_upload_chunks" ADD CONSTRAINT "category_document_upload_chunks_upload_id_category_document_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."category_document_uploads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_document_upload_chunk_idx" ON "category_document_upload_chunks" USING btree ("upload_id","chunk_index");
