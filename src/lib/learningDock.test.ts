import test from "node:test";
import assert from "node:assert/strict";
import { shouldToggleLearningDock } from "./learningDock";

test("dock toggles with M and period outside editable controls", () => {
  const body = { closest: () => null };
  assert.equal(shouldToggleLearningDock({ key: "m", target: body }), true);
  assert.equal(shouldToggleLearningDock({ key: ".", target: body }), true);
});
test("dock never steals typing, composition, or repeated keys", () => {
  const input = { closest: () => ({}) };
  assert.equal(shouldToggleLearningDock({ key: "m", target: input }), false);
  assert.equal(shouldToggleLearningDock({ key: "m", isComposing: true, target: { closest: () => null } }), false);
  assert.equal(shouldToggleLearningDock({ key: "m", repeat: true, target: { closest: () => null } }), false);
});
