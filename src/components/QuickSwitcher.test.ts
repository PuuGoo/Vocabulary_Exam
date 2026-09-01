import assert from "node:assert/strict";
import test from "node:test";
import { runAdminSetCommands, runStudentSetCommands } from "./QuickSwitcher";

const sets = [{ id: 7, name: "Quốc gia", type: "vocabulary" }];

test("student set search exposes all learning modes", () => {
  const commands = runStudentSetCommands(sets);
  assert.deepEqual(commands.map((item) => item.href), ["/learn/7", "/quiz/7?mode=fill", "/quiz/7?mode=mc", "/match/7", "/dictation/7"]);
});

test("admin set search stays in admin context", () => {
  const commands = runAdminSetCommands(sets);
  assert.deepEqual(commands.map((item) => item.href), ["/admin/sets?openSet=7"]);
  assert.equal(commands.some((item) => item.href.startsWith("/learn")), false);
});
