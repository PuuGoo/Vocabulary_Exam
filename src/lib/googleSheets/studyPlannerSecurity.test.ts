import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("planner APIs are session-owned and never accept another user's ID", () => {
  const route = readFileSync("src/app/api/study-planner/route.ts", "utf8");
  assert.equal((route.match(/await getSession\(\)/g) ?? []).length, 2);
  assert.match(route, /findStudyPlanner\(session.userId\)/);
  assert.match(route, /ensureStudyPlanner\(session\)/);
  assert.doesNotMatch(route, /req.*json|searchParams/);
});

test("student OAuth exception requires signed planner continuation and matching session", () => {
  const route = readFileSync("src/app/api/admin/google-sheets/oauth/callback/route.ts", "utf8");
  assert.match(route, /parsedState\?\.next === "\/study-planner" && parsedState.userId === session.userId/);
  assert.match(route, /!plannerFlow && \(!access \|\| !access.can\("google_sheets.manage"\)\)/);
  assert.ok(route.indexOf("parsedState.userId !== session.userId") < route.indexOf("await storeGoogleToken"));
  const server = readFileSync("src/lib/studyPlanner.ts", "utf8");
  assert.match(server, /fileId: PLANNER_TEMPLATE_ID/);
  assert.doesNotMatch(server, /permissions.create|type: "anyone"/);
});
