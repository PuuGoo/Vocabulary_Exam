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

test("authenticated and shared Learn both render the canonical LearnExperience", () => {
  const authenticated = readFileSync("src/app/(student)/learn/[setId]/page.tsx", "utf8");
  const shared = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  assert.match(authenticated, /<LearnExperience/);
  assert.match(shared, /mode === "learn"/);
  assert.match(shared, /<LearnExperience/);
});

test("shared Learn exits before generic StudyModeNav and SharedWordMode routing", () => {
  const shared = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  const canonicalLearn = shared.indexOf('mode === "learn"');
  const genericNav = shared.indexOf("<StudyModeNav");
  assert.ok(canonicalLearn >= 0 && genericNav > canonicalLearn);
});

test("shared question quiz delegates to canonical stable-option practice", () => {
  const shared = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  assert.match(shared, /import SubjectQuestionPractice/);
  assert.match(shared, /<SubjectQuestionPractice/);
  assert.doesNotMatch(shared, /correctOptions\.includes\(answer\)/);
  assert.doesNotMatch(shared, /function SharedQuestionMode/);
});

test("shared category hub renders explicit folders before direct content", () => {
  const shared = readFileSync("src/components/ShareGuestExperience.tsx", "utf8");
  assert.match(shared, /payload\.folders/);
  assert.match(shared, /currentFolder/);
  assert.match(shared, /breadcrumbs/);
});

test("admin and public documents share one Node binary response helper", () => {
  const admin = readFileSync("src/app/api/admin/category-documents/[id]/file/route.ts", "utf8");
  const shared = readFileSync("src/app/api/share/[token]/documents/[id]/route.ts", "utf8");
  assert.match(admin, /buildCategoryDocumentResponse/);
  assert.match(shared, /buildCategoryDocumentResponse/);
  assert.match(shared, /runtime = "nodejs"/);
  assert.doesNotMatch(shared, /new NextResponse\(document\.fileData/);
});
