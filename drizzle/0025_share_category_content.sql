ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "content_selection" text NOT NULL DEFAULT '["vocab","quiz","essay","speaking","documents"]';

ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "include_new_content" boolean NOT NULL DEFAULT true;

ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "content_snapshot" text NOT NULL DEFAULT '{}';
