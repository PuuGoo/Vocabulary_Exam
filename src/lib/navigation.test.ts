import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_LINKS, STUDENT_PRIMARY_NAV, STUDENT_QUICK_LINKS } from "./navigation";

test("student primary navigation is limited to five core destinations", () => {
  assert.deepEqual(STUDENT_PRIMARY_NAV.map((item) => item.href), ["/dashboard", "/study", "/assignments", "/vocabulary-vault", "/progress"]);
  assert.equal(STUDENT_PRIMARY_NAV.some((item) => item.href.startsWith("/admin")), false);
});
test("admin navigation contains no student primary destinations", () => {
  const paths = ADMIN_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
  assert.equal(paths.every((path) => path === "/admin" || path.startsWith("/admin/")), true);
});
test("secondary learning features remain discoverable", () => {
  for (const path of ["/smart-review", "/daily-challenge", "/mixed-practice", "/feynman", "/dictionary", "/notebook", "/history", "/leaderboard", "/print-sets", "/review"]) assert.equal(STUDENT_QUICK_LINKS.some((item) => item.href === path), true, path);
  assert.equal(ADMIN_QUICK_LINKS.some((item) => item.href === "/admin/backup"), true);
});
test("dashboards contain no former demo data", () => {
  const admin = readFileSync("src/app/admin/page.tsx", "utf8");
  const student = readFileSync("src/app/(student)/dashboard/page.tsx", "utf8");
  for (const value of ["Mia Thompson", "Noah Williams", "Olivia Chen", "1,284", "Academy pulse"]) assert.equal(admin.includes(value), false);
  for (const value of ["Santa", "22 tháng 7 năm 2026", "7.5 / 9.0"]) assert.equal(student.includes(value), false);
});
test("admin shell excludes student utilities and fake assistant", () => {
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  assert.match(shell, /!isAdminMode\s*&&\s*\([\s\S]*?<PomodoroTimer\s*\/>[\s\S]*?<AssignmentReminder\s*\/>/);
  assert.equal(shell.includes("Hỏi trợ lý Lexi"), false);
  assert.equal(shell.includes("<ThemeToggle"), false);
});
