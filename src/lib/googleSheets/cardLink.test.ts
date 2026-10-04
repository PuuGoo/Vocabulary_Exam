import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sheetCardUrl } from "./cardLink";

const connection = { spreadsheetId: "sheet-123", sheetId: 0, status: "connected", externalState: "accessible" };
test("card opens the exact Google tab even when synchronization is paused", () => {
  assert.equal(sheetCardUrl(connection), "https://docs.google.com/spreadsheets/d/sheet-123/edit#gid=0");
  assert.ok(sheetCardUrl({ ...connection, status: "paused" }));
  assert.ok(sheetCardUrl({ ...connection, status: "disconnected" }));
});
test("missing, trashed and invalid resources have no active card link", () => {
  assert.equal(sheetCardUrl(undefined), null);
  for (const status of ["missing", "archived", "replaced"]) assert.equal(sheetCardUrl({ ...connection, status }), null);
  assert.equal(sheetCardUrl({ ...connection, externalState: "missing" }), null);
  assert.equal(sheetCardUrl({ ...connection, spreadsheetId: "javascript:alert(1)" }), null);
});
test("list returns links only for authorized admins and visible sets", () => {
  const route = readFileSync("src/app/api/sets/route.ts", "utf8");
  assert.match(route, /adminAccess\?\.can\("google_sheets.view"\) && activeSetIds.length/);
  assert.match(route, /inArray\(googleSheetConnections.setId, activeSetIds\)/);
  const component = readFileSync("src/components/google-sheets/GoogleSheetCardLink.tsx", "utf8");
  assert.match(component, /disabled/);
  assert.match(component, /bg-slate-100/);
  assert.match(component, /bg-emerald-50/);
  assert.match(component, /rel="noopener noreferrer"/);
});

test("gray card button opens the selected set settings without creating a Sheet automatically", () => {
  const component = readFileSync("src/components/google-sheets/GoogleSheetCardLink.tsx", "utf8");
  assert.match(component, /onClick=\{onSetup\}/);
  assert.match(component, /disabled=\{disabled \|\| loading\}/);
  const page = readFileSync("src/app/admin/sets/page.tsx", "utf8");
  assert.match(page, /onSetup=\{\(\) => void openDetail\(s.id, undefined, "settings"\)\}/);
  assert.match(page, /setDetailTab\(focusWordId \? "vocabulary" : initialTab\)/);
});
