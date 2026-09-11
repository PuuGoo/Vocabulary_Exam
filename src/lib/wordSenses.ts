import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { wordSenses } from "@/db/schema";

export async function listWordSenses(wordId: number) {
  return db.select().from(wordSenses).where(eq(wordSenses.wordId, wordId)).orderBy(asc(wordSenses.position), asc(wordSenses.id));
}

export async function createWordSense(wordId: number, value: Omit<typeof wordSenses.$inferInsert, "wordId" | "position">) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from words where id=${wordId} for update`);
    if (value.isPrimary) await tx.update(wordSenses).set({ isPrimary:false,updatedAt:new Date() }).where(eq(wordSenses.wordId,wordId));
    const [row] = await tx.insert(wordSenses).values({ ...value, wordId, position: sql<number>`coalesce((select max(position) from word_senses where word_id=${wordId}),0)+1` }).returning();
    return row;
  });
}

export async function updateWordSense(wordId: number, senseId: number, value: Partial<Omit<typeof wordSenses.$inferInsert, "id" | "wordId" | "position" | "createdAt">>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from words where id=${wordId} for update`);
    if (value.isPrimary) {
      await tx.update(wordSenses).set({ isPrimary: false, updatedAt: new Date() }).where(eq(wordSenses.wordId, wordId));
    }
    const [row] = await tx.update(wordSenses).set({ ...value, updatedAt: new Date() })
      .where(and(eq(wordSenses.id, senseId), eq(wordSenses.wordId, wordId))).returning();
    return row || null;
  });
}

export async function deleteWordSense(wordId: number, senseId: number) {
  return db.transaction(async (tx) => {
    const [removed] = await tx.delete(wordSenses).where(and(eq(wordSenses.id, senseId), eq(wordSenses.wordId, wordId))).returning();
    if (!removed) return null;
    await tx.update(wordSenses).set({ position: sql`-${wordSenses.position}`, updatedAt: new Date() }).where(and(eq(wordSenses.wordId, wordId), sql`${wordSenses.position} > ${removed.position}`));
    await tx.update(wordSenses).set({ position: sql`-${wordSenses.position} - 1`, updatedAt: new Date() }).where(and(eq(wordSenses.wordId, wordId), sql`${wordSenses.position} < 0`));
    return removed;
  });
}
