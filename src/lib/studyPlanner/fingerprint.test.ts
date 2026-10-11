import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintPlannerRecord,
  plannerFingerprintKeys,
} from "@/lib/studyPlanner/fingerprint";

test("the same record content hashes identically across calls", () => {
  const fields = { task_title: "Luyện nghe", completed: true, duration_minutes: 60 };
  const first = fingerprintPlannerRecord("task", fields);
  const second = fingerprintPlannerRecord("task", fields);
  assert.equal(first, second, "the same value must never hash two different ways");
});

test("whitespace and NFC differences do not look like a content change", () => {
  const base = fingerprintPlannerRecord("task", { task_title: "On tap" });
  const messy = fingerprintPlannerRecord("task", { task_title: "  On   tap " });
  assert.equal(base, messy);
});

test("a real edit changes the fingerprint", () => {
  const base = fingerprintPlannerRecord("task", { task_title: "On tap", completed: false });
  const changed = fingerprintPlannerRecord("task", { task_title: "On tap", completed: true });
  assert.notEqual(base, changed, "flipping a checkbox must change the fingerprint");
});

test("display-only and identity fields are excluded from the hash", () => {
  // A hidden lexora_id or row number must never leak into the content hash,
  // else moving a row looks like an edit.
  const keys = plannerFingerprintKeys("task");
  assert.ok(!keys.includes("lexora_id"), "identity never participates in content");
  assert.ok(!keys.includes("row"), "row number never participates in content");
  assert.ok(!keys.includes("sheet_row"), "sheet position never participates in content");
});

test("habit completion is keyed by real date, not by grid position", () => {
  const day5 = fingerprintPlannerRecord("habitCompletion", { completion_date: "2026-10-05", completed: true });
  const day6 = fingerprintPlannerRecord("habitCompletion", { completion_date: "2026-10-06", completed: true });
  assert.notEqual(day5, day6);
});
