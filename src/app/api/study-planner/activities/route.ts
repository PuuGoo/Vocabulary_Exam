import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plannerConnectionForSession } from "@/lib/studyPlanner/mutations";
import { listPlannerActivities } from "@/lib/studyPlanner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ activities: [] });
  const url = new URL(req.url);
  return NextResponse.json({
    activities: await listPlannerActivities(connection.id, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    }),
  });
}
