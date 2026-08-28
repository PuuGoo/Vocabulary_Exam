import { sql } from "drizzle-orm";
import { db } from "@/db";

let ensured: Promise<void> | null = null;

export function ensureQuestionShuffleSchema() {
  if (!ensured) ensured = (async () => {
    await db.execute(sql`ALTER TABLE "vocab_categories" ADD COLUMN IF NOT EXISTS "shuffle_questions" boolean DEFAULT false NOT NULL;`);
    await db.execute(sql`ALTER TABLE "vocab_categories" ADD COLUMN IF NOT EXISTS "shuffle_options" boolean DEFAULT false NOT NULL;`);
    await db.execute(sql`ALTER TABLE "vocab_categories" ADD COLUMN IF NOT EXISTS "shuffle_mode" varchar(16) DEFAULT 'random' NOT NULL;`);
  })().catch((error) => { ensured = null; throw error; });
  return ensured;
}
