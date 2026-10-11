import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plannerConnectionForSession } from "@/lib/studyPlanner/mutations";
import { listPlannerBulkReviews, listPlannerConflicts } from "@/lib/studyPlanner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ conflicts: [], reviews: [] });
  const url = new URL(req.url);
  const [conflicts, reviews] = await Promise.all([
    listPlannerConflicts(connection.id, url.searchParams.get("resolved") === "1"),
    listPlannerBulkReviews(connection.id),
  ]);
  return NextResponse.json({ conflicts, bulkReviews: reviews });
}
