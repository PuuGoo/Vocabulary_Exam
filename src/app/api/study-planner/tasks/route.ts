import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  archivePlannerTask,
  createPlannerTask,
  patchPlannerTask,
  plannerConnectionForSession,
} from "@/lib/studyPlanner/mutations";
import { listPlannerTasks } from "@/lib/studyPlanner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ tasks: [] });
  const url = new URL(req.url);
  const tasks = await listPlannerTasks(connection.id, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: 200,
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const created = await createPlannerTask(session.userId, await req.json().catch(() => null));
    return NextResponse.json({ task: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tạo nhiệm vụ thất bại." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const updated = await patchPlannerTask(session.userId, await req.json().catch(() => null));
    return NextResponse.json({ task: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cập nhật nhiệm vụ thất bại." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Thiếu id." }, { status: 400 });
  try {
    // Archived, never destroyed: the Sheet row can restore it later and the
    // audit history stays intact.
    await archivePlannerTask(session.userId, id);
    return NextResponse.json({ archived: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Xoá nhiệm vụ thất bại." }, { status: 400 });
  }
}
