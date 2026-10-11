import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { createPlannerTodo, plannerConnectionForSession } from "@/lib/studyPlanner/mutations";
import { listPlannerTodos } from "@/lib/studyPlanner/queries";
import { studyPlannerTodos } from "@/db/schema";
import { db } from "@/db";
import { coordinateWebWrites } from "@/lib/studyPlanner/coordinate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ todos: [] });
  return NextResponse.json({ todos: await listPlannerTodos(connection.id) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const created = await createPlannerTodo(session.userId, await req.json().catch(() => null));
    return NextResponse.json({ todo: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tạo việc cần làm thất bại." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: number; completed?: boolean } | null;
  const todoId = body?.id;
  const completed = body?.completed;
  if (!Number.isSafeInteger(todoId) || (todoId as number) < 1 || typeof completed !== "boolean") {
    return NextResponse.json({ error: "Thiếu id hoặc trạng thái." }, { status: 400 });
  }
  const connection = await plannerConnectionForSession(session.userId);
  if (!connection) return NextResponse.json({ error: "Chưa có planner." }, { status: 404 });
  const [existing] = await db
    .select()
    .from(studyPlannerTodos)
    .where(and(eq(studyPlannerTodos.connectionId, connection.id), eq(studyPlannerTodos.id, todoId as number)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy việc cần làm." }, { status: 404 });
  const [updated] = await db
    .update(studyPlannerTodos)
    .set({ completed: completed as boolean, updatedAt: new Date() })
    .where(eq(studyPlannerTodos.id, existing.id))
    .returning();
  // Only the completion cell is mirrored back to the Sheet, never the tab.
  if (existing.sheetRow != null) {
    await coordinateWebWrites([
      {
        connectionId: connection.id,
        tab: "Danh sách việc cần làm",
        rowNumber: existing.sheetRow,
        valuesByColumn: { A: completed as boolean },
        fingerprintValues: { task_title: existing.taskTitle, completed: completed as boolean },
        domain: "todo",
      },
    ]).catch(() => undefined);
  }
  return NextResponse.json({ todo: updated });
}
