ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "custom_slug" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "share_links_custom_slug_idx"
  ON "share_links" ("custom_slug");
