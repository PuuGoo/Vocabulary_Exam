import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSheetConnections } from "@/db/schema";
import { isValidCronAuthorization } from "@/lib/backupEmailCron";
import { acquireConnectionLock, releaseConnectionLock, takePendingConnections } from "@/lib/googleSheets/store";
import { syncConnection } from "@/lib/googleSheets/sheetLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isValidCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const pending = await takePendingConnections(25);
  const results: Array<{ connectionId: number; status: string; error?: string }> = [];
  for (const { connectionId } of pending) {
    const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
    if (!connection?.enabled || connection.status === "disconnected") continue;
    try {
      await acquireConnectionLock(connectionId, "cron");
      await releaseConnectionLock(connectionId);
      await syncConnection(connectionId, "cron");
      results.push({ connectionId, status: "synced" });
    } catch (error) {
      if (error instanceof Error && error.name === "SyncInProgressError") { results.push({ connectionId, status: "locked" }); continue; }
      results.push({ connectionId, status: "error", error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return Response.json({ processed: results.length, results });
}
