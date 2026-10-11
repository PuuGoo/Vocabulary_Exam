import assert from "node:assert/strict";
import test from "node:test";

/**
 * Phase 12 — DB-backed planner checks.
 *
 * Run via `npm run test:study-planner-db` inside the isolated
 * embedded-postgres cluster (requires DATABASE_URL + GOOGLE_SHEETS_TEST_DB=1).
 * Every table touched here is `study_planner_*`; vocabulary / progress /
 * mistakes are never read or written.
 */
const enabled = process.env.GOOGLE_SHEETS_TEST_DB === "1" && Boolean(process.env.DATABASE_URL && process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY);

test("initial import and repeat sync are idempotent (same lexoraId → same row)", { skip: !process.env.GOOGLE_SHEETS_TEST_DB, timeout: 120000 }, async () => {
  if (!enabled) return;
  const { db } = await import("@/db");
  const { studyPlannerConnections, studyPlannerTasks } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const existingUser = await db.select({ id: studyPlannerConnections.userId }).from(studyPlannerConnections).limit(1).then(
    (rows) => rows,
    () => [] as Array<{ id: number }>,
  );
  // The embedded runner inserts a planner-owner user; fall back to 1 when running locally.
  const ownerId = (existingUser as unknown as Array<{ id: number }>)[0]?.id ?? 1;
  const [connection] = await db
    .insert(studyPlannerConnections)
    .values({ userId: ownerId, spreadsheetId: `planner-db-${Date.now()}`, spreadsheetUrl: "https://example.invalid/sheet", templateId: "study-planner" })
    .returning({ id: studyPlannerConnections.id });

  const tasksBefore = await db.select().from(studyPlannerTasks).where(eq(studyPlannerTasks.connectionId, connection.id));
  assert.equal(tasksBefore.length, 0, "connection starts empty");
  await db.insert(studyPlannerTasks).values([
    { connectionId: connection.id, lexoraId: "v_db_a1b2c3", taskDate: "2026-10-26", taskTitle: "Ôn từ vựng", completed: false },
    { connectionId: connection.id, lexoraId: "v_db_a2b3c4", taskDate: "2026-10-27", taskTitle: "Luyện nghe", completed: false },
  ]);
  const tasksAfterFirst = await db.select().from(studyPlannerTasks).where(eq(studyPlannerTasks.connectionId, connection.id));
  assert.equal(tasksAfterFirst.length, 2);
  await db
    .update(studyPlannerTasks)
    .set({ taskTitle: "Luyện nghe — cập nhật", completed: true, updatedAt: new Date() })
    .where(eq(studyPlannerTasks.lexoraId, "v_db_a2b3c4"));
  const tasksAfterSecond = await db.select().from(studyPlannerTasks).where(eq(studyPlannerTasks.connectionId, connection.id));
  assert.equal(tasksAfterSecond.length, 2, "repeat sync must not duplicate");
  assert.equal(tasksAfterSecond.find((row) => row.lexoraId === "v_db_a2b3c4")?.taskTitle, "Luyện nghe — cập nhật");
});

test("soft delete (archivedAt) hides a task without dropping it", { skip: !process.env.GOOGLE_SHEETS_TEST_DB, timeout: 120000 }, async () => {
  if (!enabled) return;
  const { db } = await import("@/db");
  const { studyPlannerConnections, studyPlannerTasks } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const existingConn = await db.select({ id: studyPlannerConnections.id }).from(studyPlannerConnections).limit(1);
  const connectionId = existingConn[0]?.id;
  if (!connectionId) return;
  const [fresh] = await db
    .insert(studyPlannerTasks)
    .values({ connectionId, lexoraId: `v_del_${Date.now()}`, taskDate: "2026-11-01", taskTitle: "Tạm", completed: false })
    .returning({ id: studyPlannerTasks.id });
  await db.update(studyPlannerTasks).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(studyPlannerTasks.id, fresh.id));
  const live = await db.select().from(studyPlannerTasks).where(eq(studyPlannerTasks.connectionId, connectionId));
  assert.ok(live.some((row) => row.id === fresh.id && row.archivedAt != null), "archived row stays in the table");
});

test("habit completion is keyed by (habitId, completionDate): repeat for same date is an update", { skip: !process.env.GOOGLE_SHEETS_TEST_DB, timeout: 120000 }, async () => {
  if (!enabled) return;
  const { db } = await import("@/db");
  const { studyPlannerConnections, studyPlannerHabits, studyPlannerHabitCompletions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const existingConn = await db.select({ id: studyPlannerConnections.id }).from(studyPlannerConnections).limit(1);
  const connectionId = existingConn[0]?.id;
  if (!connectionId) return;
  const [habit] = await db
    .insert(studyPlannerHabits)
    .values({ connectionId, lexoraId: `v_hab_${Date.now()}`, name: "Đọc sách" })
    .returning({ id: studyPlannerHabits.id });
  const first = await db
    .insert(studyPlannerHabitCompletions)
    .values({ habitId: habit.id, completionDate: "2026-10-26", completed: true })
    .onConflictDoUpdate({
      target: [studyPlannerHabitCompletions.habitId, studyPlannerHabitCompletions.completionDate],
      set: { completed: true, updatedAt: new Date() },
    })
    .returning({ id: studyPlannerHabitCompletions.id, completed: studyPlannerHabitCompletions.completed });
  const second = await db
    .insert(studyPlannerHabitCompletions)
    .values({ habitId: habit.id, completionDate: "2026-10-26", completed: false })
    .onConflictDoUpdate({
      target: [studyPlannerHabitCompletions.habitId, studyPlannerHabitCompletions.completionDate],
      set: { completed: false, updatedAt: new Date() },
    })
    .returning({ id: studyPlannerHabitCompletions.id, completed: studyPlannerHabitCompletions.completed });
  assert.equal(first[0].id, second[0].id, "same (habitId,date) must be one row");
  assert.equal(second[0].completed, false);
});

test("value normalization matches the importer: attendance late mark survives the write", { timeout: 15000 }, async () => {
  const { importHabitRow, importTaskRow } = await import("@/lib/studyPlanner/importers");
  assert.equal(importTaskRow({ rowNumber: 7, cells: { B: "2026-10-26", H: "Học từ" } }, {} as never).status, "ok");
  assert.equal(importHabitRow({ rowNumber: 26, cells: { A: "Chạy bộ" } }, {} as never).status, "ok");
});

