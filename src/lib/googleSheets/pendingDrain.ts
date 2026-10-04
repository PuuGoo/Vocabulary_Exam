export type PendingDrainStatus = "synced" | "partial" | "locked" | "skipped" | "error";

export async function drainPendingChanges<Result extends { status: PendingDrainStatus }>(options: {
  run: () => Promise<Result>;
  hasPending: () => Promise<boolean>;
  maxPasses?: number;
  deadlineMs?: number;
}): Promise<Result> {
  const deadline = Date.now() + (options.deadlineMs ?? 40_000);
  const maxPasses = Math.max(1, options.maxPasses ?? 3);
  let result = await options.run();
  for (let pass = 1; pass < maxPasses; pass += 1) {
    if (result.status !== "synced" && result.status !== "partial") break;
    if (Date.now() >= deadline || !(await options.hasPending())) break;
    result = await options.run();
  }
  return result;
}
