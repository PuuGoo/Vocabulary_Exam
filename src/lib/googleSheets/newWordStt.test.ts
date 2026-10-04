import assert from "node:assert/strict";
import test from "node:test";
import { newWordSttUpdates } from "./newWordStt";
import { getGoogleSheetTemplate } from "./template";

const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
test("new rows get STT independently of AI configuration", () => {
  const updates = newWordSttUpdates(template, "Words", [["STT", "__lexora_id", "Word"], ["", "v_12345678", "hello"]], "v_12345678");
  assert.equal(updates[0].rangeA1, "'Words'!A2");
  assert.equal(updates[0].values[0][0], '=IF(B2="";"";COUNTIF($B$2:B2;"<>"))');
  assert.equal(updates[0].parseFormulas, true);
});
test("STT uses actual ID column and preserves existing formulas", () => {
  const rows = [["Word", "STT", "__lexora_id"], ["hello", "", "v_12345678"]];
  assert.match(String(newWordSttUpdates(template, "Words", rows, "v_12345678")[0].values[0][0]), /C2/);
  rows[1][1] = "=ROW()-1";
  assert.deepEqual(newWordSttUpdates(template, "Words", rows, "v_12345678"), []);
});
