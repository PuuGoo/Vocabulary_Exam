import test from "node:test";
import assert from "node:assert/strict";
import { assignmentHref, assignmentProgress, type AssignmentForProgress, type AttemptForAssignment } from "./assignments";

const createdAt = new Date("2026-07-20T00:00:00Z");
const assignment: AssignmentForProgress = { setId: 4, mode: "mc", minScore: 70, dueAt: new Date("2026-07-22T00:00:00Z"), createdAt };
const attempt = (patch: Partial<AttemptForAssignment> = {}): AttemptForAssignment => ({ setId: 4, mode: "mc", score: 8, total: 10, timed: false, createdAt: new Date("2026-07-21T00:00:00Z"), ...patch });

test("assignmentProgress ignores attempts before assignment and wrong modes", () => {
  const result = assignmentProgress(assignment, [attempt({ createdAt: new Date("2026-07-19T00:00:00Z") }), attempt({ mode: "fill" })]);
  assert.equal(result.status, "pending");
  assert.equal(result.attemptCount, 0);
});

test("assignmentProgress distinguishes in progress, completed, late and overdue", () => {
  assert.equal(assignmentProgress(assignment, [attempt({ score: 6 })]).status, "in_progress");
  assert.equal(assignmentProgress(assignment, [attempt()]).status, "completed");
  assert.equal(assignmentProgress(assignment, [attempt({ createdAt: new Date("2026-07-23T00:00:00Z") })]).status, "completed_late");
  assert.equal(assignmentProgress(assignment, [], new Date("2026-07-23T00:00:00Z")).status, "overdue");
});

test("timed assignments only match timed fill attempts", () => {
  const timed = { ...assignment, mode: "timed" };
  assert.equal(assignmentProgress(timed, [attempt({ mode: "fill", timed: false })]).status, "pending");
  assert.equal(assignmentProgress(timed, [attempt({ mode: "fill", timed: true })]).status, "completed");
  assert.equal(assignmentHref({ setId: 4, mode: "timed", timeLimitMinutes: 25 }), "/quiz/4?mode=fill&timed=1&minutes=25");
});
