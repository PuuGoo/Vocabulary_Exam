CREATE TABLE IF NOT EXISTS "share_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "target_type" varchar(32) NOT NULL,
  "target_id" integer NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "access_mode" varchar(32) NOT NULL DEFAULT 'restricted',
  "allowed_modes" text NOT NULL DEFAULT '[]',
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "share_links_token_hash_idx" ON "share_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "share_links_target_idx" ON "share_links" ("target_type", "target_id");
