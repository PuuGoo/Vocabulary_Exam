import assert from "node:assert/strict";
import test from "node:test";
import { formatCategorySetName, hasCategoryPrefix, removeCategoryPrefix } from "./categorySequence";

test("category set names receive a two-digit sequence", () => {
  assert.equal(formatCategorySetName(1, "Bộ A"), "01_Bộ A");
  assert.equal(formatCategorySetName(12, "Bộ B"), "12_Bộ B");
});

test("renaming a numbered set does not duplicate its prefix", () => {
  assert.equal(removeCategoryPrefix("01_Bộ A"), "Bộ A");
  assert.equal(formatCategorySetName(2, "01_Bộ A"), "02_Bộ A");
  assert.equal(hasCategoryPrefix("01_Bộ A"), true);
  assert.equal(hasCategoryPrefix("Bộ A"), false);
});
