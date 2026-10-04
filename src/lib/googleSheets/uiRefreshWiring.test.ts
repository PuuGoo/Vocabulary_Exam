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
  assert.match(panel, /if \(latestRun\?\.status === "success" \|\| latestRun\?\.status === "partial"\) notifyVocabularyChanged\(latestRun\)/, "successful and partial runs notify the parent");
  // Spec item 12: the 30s poll is status-only and must never refresh
  // vocabulary data. It only reloads connection/runs; the vocabulary parent is
  // notified only when a NEW run finishes.
  const pollStart = panel.indexOf("setInterval");
  assert.ok(pollStart > 0, "the panel keeps its status-only polling");
  const pollBody = panel.slice(pollStart, pollStart + 600);
  assert.match(pollBody, /30000/, "poll interval must stay at 30s, never high frequency");
  assert.ok(!pollBody.includes("notifyVocabularyChanged"), "polling must never refresh vocabulary data");
  assert.ok(!/setInterval[\s\S]{0,400}fetch\(`\/api\/sets/.test(panel), "polling must never fetch vocabulary rows");
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
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 0, rowsDeleted: 0, rowsUpdated: 1 }), true);
  assert.equal(typeof GOOGLE_SHEET_SYNCED_EVENT, "string");
  assert.ok(GOOGLE_SHEET_SYNCED_EVENT.length > 0);
  assert.equal(hasVocabularyChanges({ changedWordIds: [1], rowsCreated: 0, rowsDeleted: 0 }), true);
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 1, rowsDeleted: 0 }), true);
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 0, rowsDeleted: 1 }), true);
  assert.equal(hasVocabularyChanges({ changedWordIds: [], rowsCreated: 0, rowsDeleted: 0 }), false, "an unchanged run must not trigger a reload");
});

test("vocabulary sync stays active outside settings and checks on return", () => {
  const page = readFileSync("src/app/admin/sets/page.tsx", "utf8");
  const hook = readFileSync("src/lib/googleSheets/useVocabularySync.ts", "utf8");
  assert.match(page, /useVocabularySync\(detail\?\.id, detailTab === "vocabulary"/);
  assert.doesNotMatch(hook, /method: "POST"/);
  assert.doesNotMatch(hook, /\/sync`/);
  assert.match(hook, /connection\.lastSyncedAt/);
  assert.match(hook, /previous\.revision !== revision/);
  assert.match(hook, /window\.addEventListener\("focus"/);
  assert.match(hook, /document\.addEventListener\("visibilitychange"/);
  assert.match(hook, /window\.removeEventListener\("focus"/);
  assert.match(hook, /window\.clearInterval\(timer\)/);
});

test("manual Sync Now and webhook share one sync engine (no duplicate logic)", () => {
  const syncRoute = readFileSync("src/app/api/admin/google-sheets/connections/[id]/sync/route.ts", "utf8");
  const webhookRoute = readFileSync("src/app/api/webhooks/google-drive/route.ts", "utf8");
  assert.match(syncRoute, /syncConnection\(connectionId, "manual"/, "manual sync calls the shared engine");
  assert.ok(!/runVocabularySync\(/.test(syncRoute), "the manual route must not reimplement the sync engine");
  assert.ok(!/runVocabularySync\(/.test(webhookRoute), "the webhook must not reimplement the sync engine");
  // The webhook goes through the lock-guarded shared helper (architecture test
  // covers runPendingConnection; here we only prove there is no second engine).
  assert.match(webhookRoute, /runPendingConnection\(/, "the webhook delegates to the shared reconciler");
test("Lexora never writes vocabulary cells back to the Sheet (no Lexora-origin drift)", () => {
  const lifecycle = readFileSync("src/lib/googleSheets/sheetLifecycle.ts", "utf8");
  const lines = lifecycle.split(/\r?\n/);
  const nameOf = (index: number) => {
    for (let i = index; i >= 0; i -= 1) {
      const match = lines[i].match(/^\s*(?:export )?async function (\w+)/);
      if (match) return match[1];
    }
    return "?";
  };
  // The create flow writes the initial export; every later write must touch
  // only identity (source id), STT, AI formulas or the help tab. Vocabulary
  // content is never written back by Lexora, so a webhook caused by Lexora can
  // never look like an admin edit of the same cell.
  let createWrites = 0;
  let otherWrites = 0;
  lines.forEach((line, index) => {
    if (!line.includes("api.writeValues(")) return;
    const fn = nameOf(index);
    if (fn === "createGoogleSheetForSet") { createWrites += 1; return; }
    otherWrites += 1;
    assert.ok(
      /idColumn|STT|AI|formula|AI_HELP/i.test(line) || /writeBackSourceIds|writeRowAiFormulas|writeSttFormula|ensureAiHelpSheet/.test(fn),
      `${fn} must not write vocabulary content to the Sheet`,
    );
  });
  assert.ok(createWrites >= 1, "the create flow writes the initial export");
  assert.equal(otherWrites >= 3, true, "the known post-create writes are all identity/STT/AI/help only");
});
});
