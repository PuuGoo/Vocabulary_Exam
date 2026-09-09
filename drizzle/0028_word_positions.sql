ALTER TABLE "words" ADD COLUMN IF NOT EXISTS "position" integer;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY set_id ORDER BY id)::integer AS next_position
  FROM "words"
)
UPDATE "words" AS target
SET "position" = ranked.next_position
FROM ranked
WHERE target.id = ranked.id
  AND target."position" IS NULL;

ALTER TABLE "words" ALTER COLUMN "position" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "words_set_position_idx"
  ON "words" ("set_id", "position");
