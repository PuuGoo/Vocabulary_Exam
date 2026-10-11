import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { plannerConnectionForSession, toggleHabitCompletion } from "@/lib/studyPlanner/mutations";
import { listPlannerHabits } from "@/lib/studyPlanner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ habits: [], completions: [] });
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const { habits, completions } = await listPlannerHabits(connection.id, month);
  return NextResponse.json({ habits, completions });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const row = await toggleHabitCompletion(session.userId, await req.json().catch(() => null));
    return NextResponse.json({ completion: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cập nhật habit thất bại." }, { status: 400 });
  }
}
