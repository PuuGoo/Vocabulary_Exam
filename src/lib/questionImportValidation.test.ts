import test from "node:test";
import assert from "node:assert/strict";
import { questionImportItemSchema } from "./questionImportValidation";

const base = { question: "Câu hỏi?", questionType: "multiple_choice" as const, options: ["A", "B"], correctOptions: ["A"], status: "ready" as const };

test("server import validation accepts only complete READY MCQs", () => {
  assert.equal(questionImportItemSchema.safeParse(base).success, true);
  const missing = questionImportItemSchema.safeParse({ ...base, correctOptions: [] });
  assert.equal(missing.success, false); if (!missing.success) assert.ok(missing.error.issues.some((issue) => issue.message === "MISSING_CORRECT_ANSWER"));
});

test("server import validation rejects needs-review items", () => {
  assert.equal(questionImportItemSchema.safeParse({ ...base, status: "needs_review" }).success, false);
});

test("server import validation still permits READY essay questions without a sample answer", () => {
  assert.equal(questionImportItemSchema.safeParse({ ...base, questionType: "essay", options: [], correctOptions: [] }).success, true);
});
