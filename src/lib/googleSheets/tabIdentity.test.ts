import assert from "node:assert/strict";
import test from "node:test";
import { resolveConnectedTab } from "./tabIdentity";

test("renaming or reordering tabs preserves their stable identity", () => {
  const metadata = { sheets: [{ sheetId: 20, title: "Help" }, { sheetId: 10, title: "Renamed vocabulary" }] };
  assert.deepEqual(resolveConnectedTab(metadata, 10), { sheetId: 10, title: "Renamed vocabulary" });
});

test("a deleted tab is never replaced by a same-named or first tab", () => {
  assert.throws(() => resolveConnectedTab({ sheets: [{ sheetId: 20, title: "Vocabulary" }] }, 10), /Tab đã kết nối không còn/);
  assert.throws(() => resolveConnectedTab({ sheets: [] }, 10));
});
