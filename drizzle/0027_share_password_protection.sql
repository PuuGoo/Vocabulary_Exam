ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "password_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "password_hash" text,
  ADD COLUMN IF NOT EXISTS "password_version" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;
