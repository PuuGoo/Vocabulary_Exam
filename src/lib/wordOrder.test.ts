import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasCanonicalWordPositions, moveWordIdByOffset, moveWordIdToPosition, normalizePositionedIds } from "./wordOrder";

test("moving E to position 2 keeps one continuous canonical order", () => {
  assert.deepEqual(moveWordIdToPosition([1, 2, 3, 4, 5], 5, 2), [1, 5, 2, 3, 4]);
  assert.deepEqual(moveWordIdToPosition([1, 2, 3, 4, 5], 2, 4), [1, 3, 4, 2, 5]);
});

test("up/down boundaries are no-ops", () => {
  assert.deepEqual(moveWordIdByOffset([1, 2, 3], 1, -1), [1, 2, 3]);
  assert.deepEqual(moveWordIdByOffset([1, 2, 3], 3, 1), [1, 2, 3]);
});

test("a 1000-word move is one linear in-memory reorder", () => {
  const ids = Array.from({ length: 1000 }, (_, index) => index + 1);
  const reordered = moveWordIdToPosition(ids, 1000, 25);
  assert.equal(reordered.length, 1000);
  assert.equal(reordered[24], 1000);
  assert.equal(new Set(reordered).size, 1000);
});

test("canonical positions use position then id and detect gaps", () => {
  assert.deepEqual(normalizePositionedIds([{ id: 90, position: 3 }, { id: 5, position: 1 }, { id: 7, position: 2 }]), [5, 7, 90]);
  assert.equal(hasCanonicalWordPositions([{ id: 5, position: 1 }, { id: 7, position: 2 }]), true);
  assert.equal(hasCanonicalWordPositions([{ id: 5, position: 1 }, { id: 7, position: 3 }]), false);
});

test("migration preserves legacy id order independently inside each set", () => {
  const migration = readFileSync("drizzle/0028_word_positions.sql", "utf8");
  assert.match(migration, /ROW_NUMBER\(\) OVER \(PARTITION BY set_id ORDER BY id\)/);
  assert.match(migration, /words_set_position_idx/);
  assert.match(migration, /UNIQUE INDEX/);
});

test("canonical APIs, share and print order by position with id fallback", () => {
  for (const path of ["src/app/api/sets/[id]/route.ts", "src/lib/shares.ts", "src/app/api/print-sets/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /words\.position/);
    assert.match(source, /words\.id/);
  }
});

test("admin ordering is persisted once and filtered STT stays canonical", () => {
  const page = readFileSync("src/app/admin/sets/page.tsx", "utf8");
  assert.match(page, /words\/reorder/);
  assert.match(page, /orderedIds/);
  assert.match(page, /\{w\.position\}/);
  assert.match(page, /Xóa tìm kiếm để kéo-thả/);
  assert.match(page, /Chuyển đến STT/);
});

test("backup restores new positions and legacy backups fall back to old IDs", () => {
  const restore = readFileSync("src/lib/restoreCore.ts", "utf8");
  assert.match(restore, /number\(left, "position", oldId\(left\)/);
  assert.match(restore, /nextPositionBySet/);
  const backup = readFileSync("src/lib/backupExport.ts", "utf8");
  assert.match(backup, /tx\.select\(\)\.from\(words\)/);
});
