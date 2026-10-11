import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plannerConnectionForSession } from "@/lib/studyPlanner/mutations";
import { runPendingPlannerConnection } from "@/lib/studyPlanner/reconcile";
import { renewPlannerWatchChannelIfExpiring } from "@/lib/studyPlanner/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 10 — Repair/reconciliation entrypoint for the student's own planner. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ error: "Chưa có planner." }, { status: 404 });
  const result = await runPendingPlannerConnection(connection.id, "manual");
  await renewPlannerWatchChannelIfExpiring(connection.id).catch(() => undefined);
  return NextResponse.json({ status: result.status, error: result.error ?? null });
}
