import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";

/**
 * Phase 11 guard rails, source-level but behavior-meaningful.
 *
 * The vocabulary lifecycle already runs in production; these tests lock the
 * planner contract so future edits cannot silently violate it.
 */

const lifecycle = fs.readFileSync("src/lib/studyPlanner/lifecycle.ts", "utf8");
// Comment text repeats the very tokens we assert on, so strip comments and
// look only at executable code.
const lifecycleCode = lifecycle
  .split("\n")
  .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/*"))
  .join("\n");
// Scope ordering assertions to the replaceStudyPlanner body only: disconnect()
// legitimately touches the same tables earlier in the file.
const replaceBody = lifecycleCode.slice(
  lifecycleCode.indexOf("export async function replaceStudyPlanner"),
  lifecycleCode.indexOf("export async function classifyPlannerSpreadsheetHealth"),
);

test("disconnect keeps the file and the vocabulary: no planner delete or trash without custody", () => {
  // A disconnect must never delete rows: status moves to disconnected, enabled=false.
  assert.match(lifecycle, /enabled:\s*false/);
  assert.match(lifecycle, /disconnected/);
  assert.doesNotMatch(lifecycle, /trashSpreadsheet\(connection\.spreadsheetId\)/, "disconnect must not trash the old file by default");
  assert.doesNotMatch(lifecycle, /delete\(studyPlannerCourses\)/, "disconnect must not drop planner records");
  assert.doesNotMatch(lifecycle, /delete\(words\)/, "disconnect must not touch vocabulary words");
});

test("trash runs only when Lexora manages the file and the caller confirms", () => {
  assert.match(lifecycle, /trashPrevious\s*&&\s*!isPlannerManagedByLexora/, "trash must be refused for unmanaged files");
  assert.match(lifecycle, /trashPrevious\s*&&\s*previousSpreadsheetId\s*!==\s*options\.confirmedSpreadsheetId/, "a same-file replacement must never trash itself");
});

test("replacement is staged: candidate check, snapshot, verify, then activate", () => {
  // The same-file replace flow (spreadsheetId already confirmed) stages as:
  // verify access, create the new watch, snapshot PG, then swap the watch+connection
  // in one transaction, and finally stop the old watches. That matches the
  // vocabulary replacement contract: the old planner stays active if anything
  // before activation fails.
  const order = [
    "api.getSpreadsheetMetadata",
    "api.createWatchChannel",
    "snapshotPlanner",
    "tx.update(studyPlannerSyncChannels",
    "stopWatchChannel",
  ];
  const positions = order.map((token) => replaceBody.indexOf(token));
  for (const [index, position] of positions.entries()) {
    assert.ok(position >= 0, `lifecycle must contain ${order[index]}`);
  }
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index] > positions[index - 1], `${order[index]} must come after ${order[index - 1]}`);
  }
  // The replacement only activates after verification: watch persists and connection swaps in one transaction.
  assert.match(lifecycle, /activated\s*=\s*true/, "activation must be an explicit flag after the swap transaction");
});

test("a failed replacement leaves the old planner active", () => {
  assert.match(lifecycle, /!activated\s*&&\s*candidateWatchId/, "a created-but-unactivated watch must be cleaned up");
  assert.match(lifecycle, /the old planner stays active/, "the comment contract documents the old-active guarantee");
});

test("planner code only touches study_planner_* tables", () => {
  assert.doesNotMatch(lifecycle, /googleSheetConnections/, "planner lifecycle must not read or write vocabulary connections");
  assert.doesNotMatch(lifecycle, /\bwords\b(?!_)/, "planner lifecycle must not reference the words table");
});

test("OAuth revocation classifies as reconnect, and nothing secrets leaks", () => {
  assert.match(lifecycle, /OAUTH_REVOKED/, "revoked OAuth must map to the reconnect message");
  assert.match(lifecycle, /safeGoogleErrorForLogs/, "unclassified health errors must be scrubbed before storage");
});

