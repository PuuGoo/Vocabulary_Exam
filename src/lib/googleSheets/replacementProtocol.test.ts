import assert from "node:assert/strict";
import test from "node:test";
import { runReplacementProtocol } from "./replacementProtocol";

function fixture(failAt?: string) {
  const events: string[] = [];
  const stage = async (name: string) => {
    events.push(name);
    if (name === failAt) throw new Error(name);
  };
  return {
    events,
    ports: {
      prepare: async () => { await stage("prepare"); return { spreadsheetId: "new" }; },
      verify: async () => { await stage("verify"); return { healthy: true }; },
      activate: async () => stage("activate"),
      retirePrevious: async () => stage("retire"),
      recordFailedCandidate: async () => stage("record_failure"),
    },
  };
}

test("replacement retires old resource only after verified activation", async () => {
  const current = fixture();
  const result = await runReplacementProtocol(current.ports);
  assert.deepEqual(current.events, ["prepare", "verify", "activate", "retire"]);
  assert.equal(result.cleanupPending, false);
});

test("preparation, watch/verification and activation failures never retire the old resource", async () => {
  for (const stage of ["prepare", "verify", "activate"]) {
    const current = fixture(stage);
    await assert.rejects(runReplacementProtocol(current.ports), new RegExp(stage));
    assert.equal(current.events.includes("retire"), false);
    if (stage !== "prepare") assert.equal(current.events.at(-1), "record_failure");
  }
});

test("old watch cleanup failure does not roll back a healthy active replacement", async () => {
  const current = fixture("retire");
  const result = await runReplacementProtocol(current.ports);
  assert.equal(result.cleanupPending, true);
  assert.equal(current.events.includes("record_failure"), false);
});
