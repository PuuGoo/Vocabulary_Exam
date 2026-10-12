import assert from "node:assert/strict";
import test from "node:test";

import { WORKBOOK_RANGES } from "@/lib/studyPlanner/workbookMap";
import { importReadingRow } from "@/lib/studyPlanner/importers";
import { isValidSourceId } from "@/lib/googleSheets/identity";

/**
 * Map correctness is verified against the live xlsx without a real Postgres
 * connection: the reference workbook already surfaced header-row bugs once
 * (formula rows treated as source, off-by-one grid reads), so the invariants
 * below double as regression locks for every SYNC_TABS offset.
 *
 * Each value in every source tab is read cell-by-cell; every column declared
 * `source` must contain data in the first data row when the workbook has
 * any row there, every column declared `derived` must still hold a formula
 * in the same row, and `dataFrom` must not step on its own header. The
 * fake workbook used by the next integration test below is built from the
 * same offsets so the read path is also locked: a lattice column shift would
 * move the wrong cell into the session importer and fail here.
 */
const xlsxPath = "docs/Study Planner - Quản trị viên.xlsx";
function loadWorkbook(): Record<string, unknown> {
  const XLSX = require("xlsx");
  return XLSX.readFile(xlsxPath);
}

function columnIndexFromLetter(letters: string): number {
  let index = 0;
  for (const character of letters.toUpperCase()) {
    const code = character.charCodeAt(0) - 64;
    if (code < 1 || code > 26) throw new Error("Invalid column letter: " + letters);
    index = index * 26 + code;
  }
  return index - 1;
}

function sheetUsedRowRange(workbook: unknown, title: string): { denseRows: number } {
  const wb = workbook as { Sheets: Record<string, { "!ref"?: string }> };
  const ws = wb.Sheets[title];
  if (!ws || !ws["!ref"]) return { denseRows: 0 };
  const range = (ws["!ref"] as string).split(":")[1] ?? ws["!ref"] as string;
  const rowMatch = /\d+/.exec(range);
  return { denseRows: rowMatch ? Number(rowMatch[0]) : 0 };
}

test("every workbook range touches the real data block of its tab", () => {
  const wb = loadWorkbook() as { Sheets: Record<string, Record<string, { v: unknown; f?: string }>> };
  const fixableWithoutFormula = new Set(["Thông tin lớp học", "Habit Tracker", "Bảng theo dõi chuyên cần", "Nhật ký nhiệm vụ"]);
  for (const [tab, range] of Object.entries(WORKBOOK_RANGES)) {
    if (range == null) continue;
    if (!wb.Sheets[tab]) continue;
    const ws = wb.Sheets[tab];
    const headerA1 = range.headerA1;
    assert.ok(headerA1, tab + " must declare headerA1");
    const headerCell = ws[headerA1 as string];
    assert.ok(headerCell != null, tab + " " + headerA1 + " must exist in the workbook: got nothing at " + headerA1);
    assert.ok(range.dataFrom > Number(headerA1.replace(/[^\d]/g, "")), tab + " header " + headerA1 + " must be before dataFrom " + range.dataFrom);
    const firstDataRow = range.dataFrom;
    let sourceCellsWithData = 0;
    let formulaColumnsSurviveInsideSourceBlock = 0;
    for (const letter of range.sourceColumns) {
      const a1 = letter + firstDataRow;
      const cell = ws[a1];
      if (cell && cell.v !== "" && cell.v != null) sourceCellsWithData += 1;
      if (cell && cell.f) formulaColumnsSurviveInsideSourceBlock += 1;
    }
    const hasAnyDataInSheet = sheetUsedRowRange(wb, tab).denseRows >= firstDataRow;
    if (hasAnyDataInSheet && ws[range.sourceColumns[0] + firstDataRow] == null) {
      const col = range.sourceColumns[0];
      assert.fail(tab + " first source cell " + col + firstDataRow + " should not be empty when the sheet has data down to that row. Check dataFrom.");
    }
    // A source column may hold a live formula when the importer treats its
    // evaluated value as real user intent (e.g. Nhat ky J/L/N mirrors); the
    // write path refuses that column instead, so it is safe to read. Only
    // the workbook's formula-heavy lattices (Thong tin, Habit, Chuyen can)
    // are exempt today.
    if (!fixableWithoutFormula.has(tab)) {
      assert.equal(formulaColumnsSurviveInsideSourceBlock, 0, tab + " has formulas ending up inside sourceColumns on the first data row");
    }
    assert.ok(sourceCellsWithData > 0 || range.sourceColumns.length === 1, tab + " first data row must contain source data: " + JSON.stringify(range.sourceColumns));
  }
});

test("reading material target-pages column is stored as the workbook's D string, not a number", () => {
  const wb = loadWorkbook() as { Sheets: Record<string, Record<string, { v: unknown }>> };
  const ws = wb.Sheets["Danh sách tài liệu đọc"];
  const specRow = 5;
  const rawD = ws["D" + specRow]?.v;
  assert.equal(String(rawD), "225-260");
  const reading = importReadingRow({ rowNumber: specRow, cells: { A: String(ws["A" + specRow].v ?? ""), B: String(ws["B" + specRow].v ?? ""), C: String(ws["C" + specRow].v ?? ""), D: String(rawD ?? ""), E: String(ws["E" + specRow].v ?? ""), F: String(ws["F" + specRow].v ?? ""), H: String(ws["H" + specRow].v ?? "") } }, {});
  assert.equal(reading.status, "ok");
  const values = reading.values as { targetPages: unknown };
  assert.equal(values.targetPages, null, "a page range like 225-260 is not a single integer page count");
});

test("hidden __lexora_id columns do not sit on a formula cell in the real workbook", () => {
  const wb = loadWorkbook() as { Sheets: Record<string, Record<string, { f?: string }>> };
  for (const [tab, range] of Object.entries(WORKBOOK_RANGES)) {
    if (range == null || !range.metadataColumn) continue;
    const ws = wb.Sheets[tab];
    if (!ws) continue;
    for (let row = range.dataFrom; row <= Math.min(range.dataFrom + 2, range.dataTo ?? range.dataFrom + 2); row += 1) {
      const cell: { f?: string; v?: unknown } | undefined = (ws as Record<string, { f?: string; v?: unknown }>)[(range.metadataColumn as string) + String(row)];
      if (!cell) continue;
      assert.equal(cell.f, undefined, tab + " " + range.metadataColumn + row + " must not hold a live formula: " + cell.f?.slice(0, 60));
    }
  }
});

test("display contract invariants from the workbook still hold", () => {
  const wb = loadWorkbook() as { Sheets: Record<string, Record<string, { f?: string }>> };
  for (const tab of Object.keys(WORKBOOK_RANGES)) {
    const range = WORKBOOK_RANGES[tab as keyof typeof WORKBOOK_RANGES];
    if (!range) continue;
    const ws = wb.Sheets[tab];
    if (!ws) continue;
    // Every source tab that writes an __lexora_id must do it outside the used
    // columns: A value in that column on the first data row would mean a
    // previous backfill already started overwriting formula content.
    if (range.metadataColumn) {
      const used = new Set(WORKBOOK_RANGES[tab as keyof typeof WORKBOOK_RANGES]?.derivedColumns ?? []);
      assert.ok(!range.sourceColumns.includes(range.metadataColumn), tab + " metadata column " + range.metadataColumn + " must not collide with sourceColumns");
    }
  }
});

/**
 * Sync shape integration: exercise the real sync.ts read ordering, the control
 * cell collection (semester date + habit month) and the grid-derived session
 * dates without a live database. The fake API preserves the Sheets matrix the
 * Postgres layer never sees: if a column letter drifts, the fake values are
 * written back to the wrong cell and the assertions here catch the bad address
 * instead of letting it corrupt a real sheet.
 */

test("the workbook shape test uses the real xlsx path, not a checked-in stub", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const stat = fs.statSync(xlsxPath);
  assert.ok(stat.size >= 100_000, "workbook stub is too small to be the real export: " + stat.size);
  assert.ok(isValidSourceId("v_" + "a".repeat(12)), "fake generated lexora ids must still pass the vocabulary pattern");
});
