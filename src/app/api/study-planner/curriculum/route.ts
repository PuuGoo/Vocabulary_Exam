import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plannerConnectionForSession } from "@/lib/studyPlanner/mutations";
import { listPlannerCurriculum } from "@/lib/studyPlanner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ topics: [] });
  return NextResponse.json({ topics: await listPlannerCurriculum(connection.id) });
}
