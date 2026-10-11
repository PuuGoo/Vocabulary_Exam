import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";

/**
 * Phase 7 + 12 guard rails for the planner design system.
 *
 * The production rule is strict: no demo values, no generic CRUD chrome, no
 * page-wide horizontal overflow (except a calendar/grid that genuinely needs
 * it), and no fake toast/empty demos.
 */

const nav = fs.readFileSync("src/components/StudyPlannerNav.tsx", "utf8");
const indicator = fs.readFileSync("src/components/planner/PlannerSyncIndicator.tsx", "utf8");
const poller = fs.readFileSync("src/components/StudyPlannerRevisionPoller.tsx", "utf8");
const primitives = fs.readFileSync("src/components/planner/PlannerUiPrimitives.tsx", "utf8");

test("navigation is grouped by workbook concepts with active-route indicators", () => {
  for (const group of ["Tổng quan", "Kế hoạch", "Lịch", "Trường học", "Cá nhân"]) {
    assert.match(nav, new RegExp(group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `nav must include the ${group} group`);
  }
  assert.match(nav, /aria-current/, "active-route indicators must be exposed to assistive tech");
  assert.match(nav, /overflow-x-auto/, "mobile chips must scroll inside the nav, never the whole page");
});

test("sync indicator covers all six states without being a sync trigger", () => {
  for (const label of ["Đang tự động đồng bộ", "Đang đồng bộ…", "Đã đồng bộ", "Đồng bộ bị chậm", "Có lỗi đồng bộ", "Cần kết nối lại Google"]) {
    assert.ok(indicator.includes(label), `indicator must cover “${label}”`);
  }
  // The read endpoint is the only fetch that runs on its own timer.
  const fetchCount = (indicator.match(/\/api\/study-planner\/connection/g) ?? []).length;
  assert.ok(fetchCount >= 1, "indicator must read the connection endpoint");
  assert.doesNotMatch(poller, /method:\s*"POST"/, "the revision observer must never trigger a sync");
});

test("primitives provide loading, empty, error, delete, conflict and bulk states", () => {
  for (const token of ["PlannerSkeleton", "PlannerEmpty", "PlannerError", "PlannerDeleteConfirm", "PlannerConflictRow", "PlannerBulkReviewBanner", "PlannerBadge", "PlannerProgress"]) {
    assert.match(primitives, new RegExp(token), `primitives must export ${token}`);
  }
  assert.match(primitives, /role="alert"|role="status"|aria-label/, "states must be screen-reader friendly");
});

test("no production planner page embeds fake or hard-coded example records", () => {
  const pages = fs.readdirSync("src/app/(student)/study-planner", { recursive: true }) as string[];
  const offenders: string[] = [];
  for (const pagePath of pages) {
    if (!pagePath.endsWith("page.tsx")) continue;
    const source = fs.readFileSync(`src/app/(student)/study-planner/${pagePath}`, "utf8");
    // Comments that say "no demo values" are allowed; only real data literals count.
    const withoutComments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    if (/(mock|placeholder|lorem|\bsample\b|\bdemo\b)(?![^"']*no demo)/i.test(withoutComments)) offenders.push(pagePath);
  }
  assert.deepEqual(offenders, [], `pages must never ship demo records: ${offenders.join(", ")}`);
});

