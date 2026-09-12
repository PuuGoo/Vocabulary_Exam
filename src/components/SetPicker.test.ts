import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeFolderSelection } from "./SetPicker";

test("multi-selection merges the current folder without duplicates", () => {
  assert.deepEqual(mergeFolderSelection([1, 2], [2, 3, 4]), [1, 2, 3, 4]);
});

test("select all current folder respects the consumer limit", () => {
  assert.deepEqual(mergeFolderSelection([1], [2, 3, 4, 5], 3), [1, 2, 3]);
});

test("set picker exposes dialog, search, breadcrumb, back and keyboard semantics", () => {
  const source = readFileSync("src/components/SetPicker.tsx", "utf8");
  for (const marker of ["role=\"dialog\"", "aria-modal=\"true\"", "categoryBreadcrumbs", "Quay lại", "type=\"search\"", "event.key === \"Escape\""]) {
    assert.equal(source.includes(marker), true, marker);
  }
});
