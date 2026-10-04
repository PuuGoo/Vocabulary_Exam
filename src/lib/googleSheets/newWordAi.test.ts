import assert from "node:assert/strict";
import test from "node:test";
import { newWordAiUpdates } from "./newWordAi";
import { getGoogleSheetTemplate } from "./template";

test("new web row fills only blank AI fields using saved prompts and actual columns", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const rows = [["IPA", "Meaning", "Word", "STT", "__lexora_id", "Example", "Part of Speech"], ["", "user meaning", "hello", "1", "v_12345678", "user example", '=AI("existing";C2)']];
  const before = JSON.stringify(rows);
  const updates = newWordAiUpdates(template, "Renamed", rows, "v_12345678", { ipa: "CUSTOM IPA" });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].rangeA1, "'Renamed'!A2");
  assert.match(String(updates[0].values[0][0]), /CUSTOM IPA/);
  assert.match(String(updates[0].values[0][0]), /C2/);
  assert.equal(updates[0].parseFormulas, true);
  assert.equal(JSON.stringify(rows), before);
});

test("AI follow-up finds a moved new row by ID, not stale row number", () => {
  const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
  const rows = [["Word", "Meaning", "__lexora_id"], ["other", "keep", "v_87654321"], ["hello", "", "v_12345678"]];
  assert.equal(newWordAiUpdates(template, "Words", rows, "v_12345678", null)[0].rangeA1, "'Words'!B3");
  assert.throws(() => newWordAiUpdates(template, "Words", rows, "v_missing", null));
  assert.throws(() => newWordAiUpdates(template, "Words", [...rows, rows[2]], "v_12345678", null));
});

test("all templates fill native AI fields without targeting system columns", () => {
  for (const set of [{ type: "ielts_vocab", languageCode: "en" }, { type: "language_vocab", languageCode: "zh-CN" }, { type: "irregular_verb", languageCode: "en" }]) {
    const template = getGoogleSheetTemplate(set);
    const rows = [template.fields.map(field => field.header), template.fields.map(field => field.key === "__lexora_id" ? "v_12345678" : ["term", "v1", "v2", "v3"].includes(field.key) ? "word" : "")];
    const updates = newWordAiUpdates(template, template.sheetTitle, rows, "v_12345678", null);
    assert.ok(updates.length > 0);
    assert.ok(updates.every(update => !/!A2$|!B2$/.test(update.rangeA1)));
  }
});
