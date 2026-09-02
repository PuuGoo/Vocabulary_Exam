import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("share learning shell delegates Fill to the canonical FillFocusSession", () => {
  const source = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  assert.match(source, /import FillFocusSession/);
  assert.match(source, /<FillFocusSession/);
  assert.doesNotMatch(source, /function VocabMode/);
  assert.doesNotMatch(source, /function QuestionMode/);
});

test("guest Fill sessions explicitly disable persistence", () => {
  const source = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  assert.match(source, /persist=\{false\}/);
});

test("shared shell uses canonical mode navigation", () => {
  const source = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  assert.match(source, /<StudyModeNav/);
});
