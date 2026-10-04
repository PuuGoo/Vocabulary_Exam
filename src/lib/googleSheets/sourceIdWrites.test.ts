import assert from "node:assert/strict";
import test from "node:test";
import { sourceIdWriteRanges, verifiedSourceIdWriteRanges } from "./sourceIdWrites";
import { getGoogleSheetTemplate } from "./template";

test("ID writeback follows reordered headers and rejects row movement before mutation", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const original = { headers: ["Word", "Meaning", "__lexora_id"], rows: [["hello", "greeting", ""], ["bye", "farewell", "v_existing"]] };
  const writes = [{ rowNumber: 2, sourceId: "v_new" }];
  assert.equal(verifiedSourceIdWriteRanges("Words", template, original, original, writes)[0].rangeA1, "'Words'!C2");
  assert.throws(() => verifiedSourceIdWriteRanges("Words", template, original, { ...original, rows: [...original.rows].reverse() }, writes));
  assert.throws(() => verifiedSourceIdWriteRanges("Words", template, original, { ...original, rows: [["hello", "greeting", "v_user"], original.rows[1]] }, writes));
  assert.throws(() => verifiedSourceIdWriteRanges("Words", template, original, original, [{ rowNumber: 3, sourceId: "v_wrong" }]));
});

test("sparse ID writeback never clears existing IDs in intervening rows", () => {
  const updates = sourceIdWriteRanges("Words", "B", [{ rowNumber: 5, sourceId: "new5" }, { rowNumber: 2, sourceId: "new2" }, { rowNumber: 6, sourceId: "new6" }]);
  assert.deepEqual(updates.map(update => [update.rangeA1, update.values]), [["'Words'!B2", [["new2"]]], ["'Words'!B5", [["new5"], ["new6"]]]]);
  assert.equal(updates.flatMap(update => update.values).some(row => row[0] === ""), false);
});

test("invalid or duplicate writeback rows are rejected before Google mutation", () => {
  assert.throws(() => sourceIdWriteRanges("Words", "B", [{ rowNumber: 1, sourceId: "bad" }]));
  assert.throws(() => sourceIdWriteRanges("Words", "B", [{ rowNumber: 2, sourceId: "a" }, { rowNumber: 2, sourceId: "b" }]));
});
