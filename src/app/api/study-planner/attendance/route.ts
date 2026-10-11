import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plannerConnectionForSession, setAttendanceMark } from "@/lib/studyPlanner/mutations";
import { listPlannerAttendance } from "@/lib/studyPlanner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ sessions: [], marks: [] });
  return NextResponse.json(await listPlannerAttendance(connection.id));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const mark = await setAttendanceMark(session.userId, await req.json().catch(() => null));
    return NextResponse.json({ mark });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cập nhật chuyên cần thất bại." }, { status: 400 });
  }
}
