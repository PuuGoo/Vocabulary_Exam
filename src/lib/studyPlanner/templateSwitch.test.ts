import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";

const templateTs = fs.readFileSync("src/lib/studyPlanner/template.ts", "utf8");
const server = fs.readFileSync("src/lib/studyPlanner.ts", "utf8");
const lifecycle = fs.readFileSync("src/lib/studyPlanner/lifecycle.ts", "utf8").split("\n").filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
const replaceBody = lifecycle.slice(lifecycle.indexOf("export async function replaceStudyPlanner"), lifecycle.indexOf("export async function classifyPlannerSpreadsheetHealth"));
const adminRoute = fs.readFileSync("src/app/api/admin/study-planner/template/route.ts", "utf8");
const userRoute = fs.readFileSync("src/app/api/study-planner/template-switch/route.ts", "utf8");
const migration = fs.readFileSync("drizzle/0044_study_planner_template_registry.sql", "utf8");

test("template registry is admin-gated and stores a bare id", () => {
  assert.match(templateTs, /STUDY_PLANNER_TEMPLATE_SETTING_KEY/);
  assert.match(templateTs, /extractPlannerTemplateId/);
  assert.match(templateTs, /spreadsheets\/d\//);
  assert.match(templateTs, /getActivePlannerTemplateId/);
  assert.match(templateTs, /setActivePlannerTemplateId/);
  assert.match(templateTs, /plannerTemplateUrl/);
});

test("new planners copy the admin-chosen active template, not the hardcoded constant", () => {
  assert.match(server, /getActivePlannerTemplateId\(PLANNER_TEMPLATE_ID\)/);
  assert.match(server, /const templateId = await getActivePlannerTemplateId\(PLANNER_TEMPLATE_ID\)/);
});

test("template switch creates a fresh personal copy then swaps with a snapshot + new channel", () => {
  assert.match(userRoute, /getActivePlannerTemplateId\(PLANNER_TEMPLATE_ID\)/);
  assert.match(userRoute, /snapshotPlanner\(connection\.id, "switch_template_before"\)/);
  assert.match(userRoute, /drive\.files\.copy/);
  assert.match(userRoute, /destinationSpreadsheetId: copiedId/);
  assert.match(userRoute, /templateId,/);
});

test("replaceStudyPlanner is cross-file: destinationSpreadsheetId branch preserves 409 on stale confirm", () => {
  assert.match(lifecycle, /destinationSpreadsheetId\?: string/);
  assert.match(lifecycle, /templateId\?: string/);
  assert.match(lifecycle, /connection\.spreadsheetId !== options\.confirmedSpreadsheetId && options\.destinationSpreadsheetId == null/);
  assert.match(lifecycle, /const destinationId = options\.destinationSpreadsheetId/);
  assert.match(lifecycle, /api\.getSpreadsheetMetadata\(destinationId\)/);
  assert.match(lifecycle, /api\.createWatchChannel\(\{ spreadsheetId: destinationId/);
});

test("planner template admin route is gated by google_sheets.manage", () => {
  assert.match(adminRoute, /requireAdminPermission\("google_sheets\.manage"\)/);
  assert.match(adminRoute, /extractPlannerTemplateId/);
  assert.match(adminRoute, /writeAdminAudit/);
  assert.doesNotMatch(adminRoute, /\bwords\b(?!_)/);
});

test("0044 registry migration is additive and idempotent", () => {
  assert.match(migration, /ON CONFLICT \(key\) DO NOTHING/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS template_id/);
  assert.doesNotMatch(migration, /DROP|TRUNCATE/);
});

test("ensureStudyPlanner always leaves a connection row behind (legacy rows included)", () => {
  // A planner created before study_planner_connections existed has a legacy
  // row but no connection, so every panel/health/switch endpoint answered
  // 404 for it. ensureStudyPlanner must create the connection in both branches
  // without ever copying a second file or touching vocabulary.
  assert.match(server, /\.onConflictDoNothing\(\{ target: studyPlannerConnections\.userId \}\)/);
  assert.match(server, /\.onConflictDoUpdate\(\{/);
  assert.doesNotMatch(server, /delete\(studyPlanner/);
  assert.doesNotMatch(server, /\bwords\b(?!_)/);
});

test("the __lexora_id column is created before it is written (grid limits)", () => {
  // A template that was never synced has no id column: writing AN/AP/AR/AQ
  // fails with "exceeds grid limits". The tab must be expanded first, and
  // Google only accepts startIndex one below the grid size.
  const engine = fs.readFileSync("src/lib/studyPlanner/syncPlannerEngine.ts", "utf8");
  assert.match(engine, /ensureMetadataColumnWidth/);
  assert.match(engine, /insertDimension/);
  assert.match(engine, /inheritFromBefore: true/);
  assert.match(engine, /startIndex: Math\.max\(0, current - 1\)/);
  assert.ok(
    engine.indexOf("await ensureMetadataColumnWidth(api") < engine.indexOf("const ranges = metadataWriteRanges(entry.tab"),
    "the grid must be expanded before the metadata write",
  );
});

test("switching twice returns the same file instead of copying again", () => {
  // Already covered by the idempotent guard on templateId + destinationId.
  assert.match(userRoute, /alreadyOnTemplate: true/);
  assert.match(userRoute, /connection\.templateId === templateId/);
});

test("the connection URL travels with the id so the panel never reopens the old file", () => {
  assert.match(lifecycle, /spreadsheetUrl: `https:\/\/docs\.google\.com\/spreadsheets\/d\/\$\{destinationId\}\/edit`/);
});
test("refresh without overwrite: old planner stays active until staged swap succeeds", () => {
  assert.match(replaceBody, /snapshotPlanner/);
  assert.match(replaceBody, /activated = true/);
  assert.match(replaceBody, /!activated && candidateWatchId/);
});
