import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { mistakes, vocabSets, words } from "@/db/schema";

export type WordOrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockVocabularySets(tx: WordOrderTx, setIds: readonly number[]) {
  const ids = [...new Set(setIds)].sort((left, right) => left - right);
  if (!ids.length) return;
  await tx.execute(sql`SELECT id FROM vocab_sets WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);
}

export async function canonicalWordIds(tx: WordOrderTx, setId: number) {
  const rows = await tx.select({ id: words.id }).from(words).where(eq(words.setId, setId)).orderBy(asc(words.position), asc(words.id));
  return rows.map((row) => row.id);
}

export async function writeCanonicalWordPositions(tx: WordOrderTx, setId: number, orderedIds: readonly number[]) {
  if (!orderedIds.length) return;
  // Clear the unique (set_id, position) namespace first. Negative word IDs are
  // unique and never observable after the surrounding transaction commits.
  await tx.update(words).set({ position: sql`-${words.id}` }).where(eq(words.setId, setId));
  const values = sql.join(orderedIds.map((id, index) => sql`(${id}, ${index + 1})`), sql`, `);
  await tx.execute(sql`UPDATE words AS target SET position = source.position FROM (VALUES ${values}) AS source(id, position) WHERE target.id = source.id AND target.set_id = ${setId}`);
}

export async function normalizeWordPositions(tx: WordOrderTx, setId: number) {
  const orderedIds = await canonicalWordIds(tx, setId);
  await writeCanonicalWordPositions(tx, setId, orderedIds);
  return orderedIds;
}

export async function appendWord<T extends typeof words.$inferInsert>(tx: WordOrderTx, setId: number, value: Omit<T, "position">) {
  await lockVocabularySets(tx, [setId]);
  const [last] = await tx.select({ position: words.position }).from(words).where(eq(words.setId, setId)).orderBy(sql`${words.position} DESC`, sql`${words.id} DESC`).limit(1);
  const [created] = await tx.insert(words).values({ ...value, setId, position: (last?.position || 0) + 1 }).returning();
  return created;
}

export async function appendWords(tx: WordOrderTx, setId: number, values: readonly Omit<typeof words.$inferInsert, "position">[]) {
  if (!values.length) return [];
  await lockVocabularySets(tx, [setId]);
  const [last] = await tx.select({ position: words.position }).from(words).where(eq(words.setId, setId)).orderBy(sql`${words.position} DESC`, sql`${words.id} DESC`).limit(1);
  const start = last?.position || 0;
  return tx.insert(words).values(values.map((value, index) => ({ ...value, setId, position: start + index + 1 }))).returning();
}

export async function reorderWords(setId: number, orderedIds: readonly number[]) {
  return db.transaction(async (tx) => {
    await lockVocabularySets(tx, [setId]);
    const [set] = await tx.select({ id: vocabSets.id }).from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
    if (!set) return { kind: "missing_set" as const };
    const currentIds = await canonicalWordIds(tx, setId);
    if (currentIds.length !== orderedIds.length) return { kind: "stale" as const };
    const currentSet = new Set(currentIds);
    if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !currentSet.has(id))) return { kind: "invalid" as const };
    await writeCanonicalWordPositions(tx, setId, orderedIds);
    return { kind: "ok" as const };
  });
}

export async function deleteWordsAndNormalize(ids: readonly number[]) {
  return db.transaction(async (tx) => {
    const selected = await tx.select({ id: words.id, setId: words.setId }).from(words).where(inArray(words.id, [...ids]));
    if (selected.length !== ids.length) return { kind: "stale" as const, deleted: 0 };
    const setIds = [...new Set(selected.map((row) => row.setId))];
    await lockVocabularySets(tx, setIds);
    const lockedSelection = await tx.select({ id: words.id, setId: words.setId }).from(words).where(inArray(words.id, [...ids]));
    if (lockedSelection.length !== ids.length || lockedSelection.some((row) => !setIds.includes(row.setId))) return { kind: "stale" as const, deleted: 0 };
    await tx.delete(words).where(inArray(words.id, [...ids]));
    for (const setId of setIds) await normalizeWordPositions(tx, setId);
    return { kind: "ok" as const, deleted: selected.length };
  });
}

export async function moveWordsToSet(ids: readonly number[], targetSetId: number) {
  return db.transaction(async (tx) => {
    const preliminary = await tx.select({ id: words.id, setId: words.setId }).from(words).where(inArray(words.id, [...ids]));
    if (preliminary.length !== ids.length) return { kind: "stale" as const };
    const sourceSetIds = [...new Set(preliminary.map((row) => row.setId))];
    await lockVocabularySets(tx, [...sourceSetIds, targetSetId]);
    const [target] = await tx.select({ id: vocabSets.id, type: vocabSets.type }).from(vocabSets).where(eq(vocabSets.id, targetSetId)).limit(1);
    if (!target) return { kind: "missing_target" as const };
    const selected = await tx.select({ id: words.id, setId: words.setId, position: words.position, type: vocabSets.type })
      .from(words).innerJoin(vocabSets, eq(vocabSets.id, words.setId)).where(inArray(words.id, [...ids]))
      .orderBy(asc(words.setId), asc(words.position), asc(words.id));
    if (selected.length !== ids.length) return { kind: "stale" as const };
    if (selected.some((row) => row.type !== target.type)) return { kind: "incompatible" as const };
    if (selected.some((row) => row.setId === targetSetId)) return { kind: "same_set" as const };

    const selectedSet = new Set(ids);
    const targetBefore = (await canonicalWordIds(tx, targetSetId)).filter((id) => !selectedSet.has(id));
    const movedIds = selected.filter((row) => row.setId !== targetSetId).map((row) => row.id);
    await tx.update(words).set({ setId: targetSetId, position: sql`-${words.id}` }).where(inArray(words.id, movedIds));
    await tx.update(mistakes).set({ setId: targetSetId }).where(inArray(mistakes.wordId, movedIds));
    for (const sourceSetId of sourceSetIds.filter((id) => id !== targetSetId)) await normalizeWordPositions(tx, sourceSetId);
    await writeCanonicalWordPositions(tx, targetSetId, [...targetBefore, ...movedIds]);
    return { kind: "ok" as const, moved: movedIds.length };
  });
}
