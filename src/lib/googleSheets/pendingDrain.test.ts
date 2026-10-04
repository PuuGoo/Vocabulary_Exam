import assert from "node:assert/strict";
import test from "node:test";
import { drainPendingChanges, type PendingDrainStatus } from "./pendingDrain";

test("drains a notification received while a read was running", async () => {
  let runs = 0;
  let pending = false;
  const result = await drainPendingChanges({
    run: async () => {
      runs += 1;
      pending = runs === 1;
      return { status: "synced" as const };
    },
    hasPending: async () => pending,
  });
  assert.equal(runs, 2);
  assert.equal(result.status, "synced");
  assert.equal(pending, false);
});

test("bounds catch-up passes without discarding remaining work", async () => {
  let runs = 0;
  await drainPendingChanges({
    run: async () => { runs += 1; return { status: "synced" as const }; },
    hasPending: async () => true,
  });
  assert.equal(runs, 3);
});

test("does not busy-loop on locked, failed or inactive connections", async () => {
  for (const status of ["locked", "error", "skipped"] as PendingDrainStatus[]) {
    let runs = 0;
    await drainPendingChanges({
      run: async () => { runs += 1; return { status }; },
      hasPending: async () => { throw new Error("must not poll"); },
    });
    assert.equal(runs, 1);
  }
});

test("does not begin another pass beyond its request time budget", async () => {
  let runs = 0;
  await drainPendingChanges({
    run: async () => { runs += 1; return { status: "partial" as const }; },
    hasPending: async () => true,
    deadlineMs: 0,
  });
  assert.equal(runs, 1);
});
