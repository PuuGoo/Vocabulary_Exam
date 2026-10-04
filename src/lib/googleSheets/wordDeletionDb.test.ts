import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { deleteWordsAndNormalize } from "@/lib/wordOrder.server";

test("manual word deletion renumbers remaining words on PostgreSQL", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [set] = await db.insert(vocabSets).values({ name: "manual-delete-regression", type: "ielts_vocab" }).returning();
  try {
    const created = await db.insert(words).values([1, 2, 3].map(position => ({ setId: set.id, position, term: `word${position}`, meaning: "meaning" }))).returning();
    assert.deepEqual(await deleteWordsAndNormalize([created[1].id]), { kind: "ok", deleted: 1 });
    const remaining = await db.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position));
    assert.deepEqual(remaining.map(word => word.id), [created[0].id, created[2].id]);
    assert.deepEqual(remaining.map(word => word.position), [1, 2]);
  } finally {
    await db.delete(vocabSets).where(eq(vocabSets.id, set.id));
  }
});
