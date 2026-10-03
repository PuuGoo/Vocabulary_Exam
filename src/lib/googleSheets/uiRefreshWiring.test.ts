import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { GOOGLE_SHEET_SYNCED_EVENT, hasVocabularyChanges } from "@/lib/googleSheets/syncEvent";

/**
 * Spec items 8/11: after a successful sync the panel must notify the parent
 * vocabulary page, and the parent must refresh the visible set. These tests
 * lock the wiring so a future refactor cannot silently drop the callback.
 */
test("the panel accepts an onVocabularyChanged callback and fires it after a sync", () => {
  const panel = readFileSync("src/components/GoogleSheetsPanel.tsx", "utf8");
  assert.match(panel, /onVocabularyChanged\?: \(wordIds: number\[\]\) => void/, "the panel exposes the callback prop");
  assert.match(panel, /onVocabularyChanged\?\.\(changedWordIds\)/, "the callback is invoked with the changed word ids");
  assert.match(panel, /notifyVocabularyChanged\(\{ \.\.\.stats, finishedAt/, "manual sync notifies the parent");
  assert.match(panel, /if \(latestRun\?\.status === "success"\) notifyVocabularyChanged\(latestRun\)/, "a newly finished run notifies the parent");
  // The 30s poll is status-only: it must never notify the vocabulary parent.
  const pollStart = panel.indexOf("setInterval");
  assert.ok(pollStart > 0, "the panel keeps its status-only polling");
  const pollBody = panel.slice(pollStart, pollStart + 600);
  assert.ok(!pollBody.includes("notifyVocabularyChanged"), "polling must never refresh vocabulary data");
});

test("the parent page listens for the sync event and refreshes the open set", () => {
  const page = readFileSync("src/app/admin/sets/page.tsx", "utf8");
  assert.match(page, /GOOGLE_SHEET_SYNCED_EVENT/, "the page imports the sync event");
  assert.match(page, /refreshDetailWords\(setId\)/, "the page re-reads the open set");
  assert.match(page, /onVocabularyChanged=\{\(\) => \{ void refreshDetailWords\(detail\.id\); void loadSets\(\); \}\}/, "the panel callback is wired to a targeted refresh");
  // A refresh must never yank the admin out of the current view.
  assert.match(page, /current && current\.id === setId \? \{ \.\.\.current, \.\.\.data\.set \} : current/, "refresh keeps tab/search/selection state");
});

test("the sync event payload carries everything the parent needs", () => {
  assert.equal(typeof GOOGLE_SHEET_SYNCED_EVENT, "string");
  assert.ok(GOOGLE_SHEET_SYNCED_EVENT.length > 0);
  assert.equal(hasVocabularyChanges({ changedWordIds: [1], rowsCreated: 0, rowsDeleted: 0 }), true);
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 1, rowsDeleted: 0 }), true);
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 0, rowsDeleted: 1 }), true);
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 0, rowsDeleted: 0 }), false, "an unchanged run must not trigger a reload");
});