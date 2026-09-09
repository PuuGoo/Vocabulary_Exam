ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_profile" varchar(32);

CREATE TABLE IF NOT EXISTS "admin_permission_overrides" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission" varchar(64) NOT NULL,
  "allowed" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_permission_overrides_user_permission_idx" ON "admin_permission_overrides" ("user_id", "permission");

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_display_name" varchar(128),
  "action" varchar(96) NOT NULL,
  "resource_type" varchar(64) NOT NULL,
  "resource_id" varchar(128),
  "target_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" text DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actor_idx" ON "admin_audit_logs" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_idx" ON "admin_audit_logs" ("created_at");

UPDATE "users" SET "admin_profile" = NULL WHERE "role" <> 'admin';
UPDATE "users" SET "admin_profile" = 'manager' WHERE "role" = 'admin' AND "admin_profile" IS NULL;
UPDATE "users" SET "admin_profile" = 'owner' WHERE "role" = 'admin' AND lower("username") = 'admin';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin') AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin' AND "admin_profile" = 'owner') THEN
    UPDATE "users" SET "admin_profile" = 'owner' WHERE "id" = (SELECT min("id") FROM "users" WHERE "role" = 'admin');
  END IF;
END $$;
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_admin_profile_check";
ALTER TABLE "users" ADD CONSTRAINT "users_admin_profile_check" CHECK (("role" = 'admin' AND "admin_profile" IN ('owner', 'manager', 'content_editor', 'viewer', 'custom')) OR ("role" <> 'admin' AND "admin_profile" IS NULL));
