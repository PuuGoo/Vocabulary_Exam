import { NextRequest } from "next/server";
import { isValidCronAuthorization } from "@/lib/backupEmailCron";
import { renewGoogleWatchChannels } from "@/lib/googleSheets/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isValidCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await renewGoogleWatchChannels(undefined, { thresholdHours: 6 });
  return Response.json({ results });
}
