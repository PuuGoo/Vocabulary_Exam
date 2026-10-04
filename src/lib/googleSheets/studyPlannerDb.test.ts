import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, studyPlanners } from "@/db/schema";
import { ensureStudyPlanner, findStudyPlanner, PLANNER_TEMPLATE_ID, plannerUrl } from "@/lib/studyPlanner";

test("planner creation is serialized per user and reuses copies after DB retry", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const created = await db.insert(users).values(["planner-a", "planner-b"].map(username => ({ username, displayName: username, passwordHash: "test", role: "student" }))).returning();
  const copies = new Map<string, string>();
  let copyCount = 0;
  const api = { find: async (key: string) => copies.get(key) ?? null, copy: async (key: string) => { const id = `copy-${++copyCount}`; copies.set(key, id); return id; } };
  try {
    const first = { userId: created[0].id, displayName: created[0].displayName };
    const results = await Promise.all([ensureStudyPlanner(first, api), ensureStudyPlanner(first, api)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(copyCount, 1);
    await db.delete(studyPlanners).where(eq(studyPlanners.userId, first.userId));
    assert.deepEqual(await ensureStudyPlanner(first, api), results[0]);
    assert.equal(copyCount, 1);
    const second = await ensureStudyPlanner({ userId: created[1].id, displayName: created[1].displayName }, api);
    assert.notEqual(second.url, results[0].url);
    assert.deepEqual(await findStudyPlanner(first.userId), results[0]);
    assert.equal(copyCount, 2);
    assert.ok(!results[0].url.includes(PLANNER_TEMPLATE_ID));
  } finally { for (const user of created) await db.delete(users).where(eq(users.id, user.id)); }
});

test("copy failure is retryable and never records the shared template as a personal planner", { skip: process.env.GOOGLE_SHEETS_TEST_DB !== "1" }, async () => {
  const [user] = await db.insert(users).values({ username: "planner-failure", displayName: "test", passwordHash: "test" }).returning();
  try {
    await assert.rejects(ensureStudyPlanner({ userId: user.id, displayName: user.displayName }, { find: async () => null, copy: async () => { throw new Error("access denied"); } }), /access denied/);
    assert.equal(await findStudyPlanner(user.id), null);
    const result = await ensureStudyPlanner({ userId: user.id, displayName: user.displayName }, { find: async () => null, copy: async () => "personal-copy" });
    assert.equal(result.url, plannerUrl("personal-copy"));
  } finally { await db.delete(users).where(eq(users.id, user.id)); }
});
